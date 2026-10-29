import http from "node:http";
import { readFile, writeFile, mkdir, rename, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { EnvHttpProxyAgent } from "undici";
import { analyzeRepository, validateGitHubRepository } from "./analyzer.mjs";
import { auditDependencies } from "./audit.mjs";
import { createAuth } from "./auth.mjs";
import { aiReview, staticReview } from "./review.mjs";
import { demoRepositories } from "./demo.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const activeGitProcesses = new Set();
const errorWithStatus = (message, status) =>
  Object.assign(new Error(message), { status });
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function readBody(req, limit = 16000) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw errorWithStatus("Content-Type must be application/json.", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw errorWithStatus("Request is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function parseBody(raw) {
  try {
    const body = JSON.parse(raw.toString("utf8") || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    return body;
  } catch {
    throw errorWithStatus("Invalid JSON object.", 400);
  }
}

async function git(args, cwd, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const gitEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_LFS_SKIP_SMUDGE: "1",
    };
    if (process.env.NEXORA_GITHUB_TOKEN) {
      const count = Number(gitEnv.GIT_CONFIG_COUNT || 0);
      if (!Number.isSafeInteger(count) || count < 0)
        return reject(new Error("Git environment configuration is invalid."));
      gitEnv.GIT_CONFIG_COUNT = String(count + 1);
      gitEnv[`GIT_CONFIG_KEY_${count}`] =
        "http.https://github.com/.extraheader";
      gitEnv[`GIT_CONFIG_VALUE_${count}`] =
        `Authorization: Basic ${Buffer.from(`x-access-token:${process.env.NEXORA_GITHUB_TOKEN}`).toString("base64")}`;
    }
    const child = spawn(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "protocol.file.allow=never",
        "-c",
        "credential.interactive=false",
        ...args,
      ],
      {
        cwd,
        detached: process.platform !== "win32",
        env: gitEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    activeGitProcesses.add(child);
    let output = "",
      timedOut = false;
    const stop = (signal) => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* Already exited. */
      }
    };
    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      stop("SIGTERM");
      forceTimer = setTimeout(() => stop("SIGKILL"), 3000);
    }, timeout);
    child.stdout.on("data", (data) => {
      if (output.length < 8192) output += data;
    });
    child.stderr.resume();
    child.on("error", () => {
      activeGitProcesses.delete(child);
      clearTimeout(timer);
      clearTimeout(forceTimer);
      reject(new Error("Git could not start. Check the server installation."));
    });
    child.on("close", (code) => {
      activeGitProcesses.delete(child);
      clearTimeout(timer);
      clearTimeout(forceTimer);
      if (timedOut)
        reject(new Error("GitHub import timed out. Try a smaller repository."));
      else if (code)
        reject(
          new Error(
            "GitHub import failed. Check repository read access and that the selected commit exists.",
          ),
        );
      else resolve(output.trim());
    });
  });
}

export async function createApplication(options = {}) {
  const root = options.sourceRoot || projectRoot;
  const dataDir =
    options.dataDir ||
    process.env.NEXORA_DATA_DIR ||
    path.join(projectRoot, ".nexora");
  const stateFile = path.join(dataDir, "workspace.json");
  const cloneDir =
    process.env.NEXORA_REPO_CACHE ||
    path.join(dataDir, "temporary-repositories");
  await mkdir(dataDir, { recursive: true });
  await mkdir(cloneDir, { recursive: true });
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const auth = await createAuth(
    options.authPassword ?? process.env.NEXORA_AUTH_PASSWORD,
    { production },
  );
  const aiKey = process.env.NEXORA_AI_API_KEY;
  const aiModel = process.env.NEXORA_AI_MODEL || "gpt-4.1-mini";
  const webhookSecret =
    options.webhookSecret ?? process.env.NEXORA_GITHUB_WEBHOOK_SECRET;
  const dispatcher = new EnvHttpProxyAgent();
  let state = { repositories: [], jobs: [] };
  try {
    state = JSON.parse(await readFile(stateFile, "utf8"));
    if (!Array.isArray(state.repositories))
      throw new Error("Invalid workspace");
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(
        "Workspace data is invalid. Recover workspace.json before restarting; it has not been modified.",
      );
  }
  let repositories = state.repositories;
  const jobs = new Map(
    (state.jobs || []).map((job) => [
      job.id,
      job.status === "running"
        ? {
            ...job,
            status: "failed",
            message: "The server restarted during analysis. Run it again.",
          }
        : job,
    ]),
  );
  let activeJob = null,
    saving = Promise.resolve(),
    reviewing = false;
  function persist() {
    saving = saving
      .catch(() => {})
      .then(async () => {
        const data = JSON.stringify(
          { repositories, jobs: [...jobs.values()].slice(-50) },
          null,
          2,
        );
        await writeFile(`${stateFile}.tmp`, data, { mode: 0o600 });
        await rename(`${stateFile}.tmp`, stateFile);
      });
    return saving;
  }
  async function processQueue() {
    if (activeJob) return;
    const job = [...jobs.values()].find(
      (job) => job.status === "running" && !job.startedAt,
    );
    if (!job) return;
    activeJob = job.id;
    job.startedAt = new Date().toISOString();
    let importedDirectory;
    try {
      let directory = root;
      let meta = {
        id: "local-nexora",
        name: "NEXORA",
        owner: "workspace",
        source: "local",
        branch: "work",
      };
      if (job.repository) {
        job.message = "Importing from GitHub";
        job.progress = 8;
        importedDirectory = directory = path.join(cloneDir, randomUUID());
        await git(
          [
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--no-recurse-submodules",
            `https://github.com/${job.repository}.git`,
            directory,
          ],
          root,
        );
        if (job.commit) {
          await git(["fetch", "--depth", "1", "origin", job.commit], directory);
          await git(["checkout", "--detach", job.commit], directory);
        }
        const [owner, name] = job.repository.split("/");
        meta = {
          id: `github-${job.repository.toLowerCase().replace("/", "-")}${job.pullRequest ? `-pr-${job.pullRequest}` : ""}`,
          name: `${name}${job.pullRequest ? ` #${job.pullRequest}` : ""}`,
          owner,
          source: "github",
          branch:
            job.commit || (await git(["branch", "--show-current"], directory)),
          githubRepository: job.repository,
          pullRequest: job.pullRequest,
        };
      } else {
        try {
          meta.branch = await git(["symbolic-ref", "--short", "HEAD"], root);
        } catch {
          /* An unborn local checkout is supported. */
        }
      }
      const result = await analyzeRepository(
        directory,
        meta,
        (message, progress) => {
          job.message = message;
          job.progress = Math.min(progress, 68);
        },
      );
      job.message =
        "Checking locked dependency versions against npm advisories";
      job.progress = 72;
      const audit = await auditDependencies(directory, {
        dispatcher,
        ...(options.auditOptions || {}),
      });
      result.dependencyAudit = {
        status: audit.status,
        packagesScanned: audit.packagesScanned,
        reason: audit.reason,
        findingsCount: audit.findings.length,
      };
      result.findings.push(...audit.findings);
      result.truncated ||= Boolean(audit.truncated);
      result.securityScore = result.filesScanned
        ? Math.max(
            0,
            100 -
              result.findings.filter((f) => f.category === "security").length *
                7,
          )
        : 0;
      result.commit =
        job.commit ||
        (await git(["rev-parse", "--verify", "HEAD"], directory).catch(
          () => null,
        ));
      result.automatedReview = staticReview(result);
      result.durationMs = Date.now() - new Date(job.startedAt).getTime();
      const previous = repositories.find((r) => r.id === result.id);
      if (previous)
        result.history = [...previous.history, ...result.history].slice(-90);
      repositories = [
        ...repositories.filter((r) => r.id !== result.id),
        result,
      ];
      Object.assign(job, {
        status: "complete",
        progress: 100,
        message: "Analysis complete",
        result,
        completedAt: new Date().toISOString(),
      });
      await persist();
    } catch (error) {
      Object.assign(job, {
        status: "failed",
        message: error.message,
        completedAt: new Date().toISOString(),
      });
      await persist().catch(() => {});
    } finally {
      if (importedDirectory)
        await rm(importedDirectory, { recursive: true, force: true }).catch(
          () => {},
        );
      activeJob = null;
      void processQueue();
    }
  }
  async function enqueue(input, delivery) {
    if (delivery) {
      const duplicate = [...jobs.values()].find(
        (job) => job.delivery === delivery,
      );
      if (duplicate) return duplicate;
    }
    if (
      [...jobs.values()].filter((job) => job.status === "running").length >= 5
    )
      throw errorWithStatus(
        "The analysis queue is full. Try again shortly.",
        429,
      );
    if (
      repositories.length >= 20 &&
      !repositories.some((r) =>
        input.repository
          ? r.githubRepository === input.repository ||
            `${r.owner}/${r.name}` === input.repository
          : r.id === "local-nexora",
      )
    )
      throw errorWithStatus(
        "This workspace supports 20 repositories. Remove an analysis before adding another.",
        409,
      );
    const job = {
      id: randomUUID(),
      status: "running",
      progress: 0,
      message: activeJob ? "Queued for analysis" : "Starting analysis",
      createdAt: new Date().toISOString(),
      ...input,
      delivery,
    };
    if (jobs.size >= 50) {
      const completed = [...jobs.values()].find(
        (job) => job.status !== "running",
      );
      if (completed) jobs.delete(completed.id);
    }
    jobs.set(job.id, job);
    await persist();
    void processQueue();
    return job;
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        (req.method === "GET" || req.method === "HEAD") &&
        url.pathname === "/api/health"
      )
        return json(res, 200, { status: "ok", version: "1.0.0" });
      if (req.method === "POST" && url.pathname === "/api/webhooks/github") {
        if (!webhookSecret)
          throw errorWithStatus("GitHub webhooks are not configured.", 503);
        const raw = await readBody(req, 1_000_000);
        const signature = req.headers["x-hub-signature-256"] || "";
        const expected = `sha256=${createHmac("sha256", webhookSecret).update(raw).digest("hex")}`;
        if (
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          throw errorWithStatus("Invalid webhook signature.", 403);
        const payload = parseBody(raw),
          event = req.headers["x-github-event"];
        if (event === "ping") return json(res, 200, { ok: true });
        if (
          payload.deleted ||
          !["push", "pull_request"].includes(event) ||
          (event === "pull_request" &&
            !["opened", "reopened", "synchronize"].includes(payload.action))
        )
          return json(res, 200, { ignored: true });
        const pr = event === "pull_request" ? payload.pull_request : null;
        const repository = validateGitHubRepository(
          pr?.head?.repo?.full_name || payload.repository?.full_name,
        );
        const commit = pr?.head?.sha || payload.after;
        if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(commit || ""))
          throw errorWithStatus("Webhook commit is invalid.", 400);
        const pullRequest = pr ? Number(payload.number) : undefined;
        if (pr && (!Number.isSafeInteger(pullRequest) || pullRequest < 1))
          throw errorWithStatus("Pull request number is invalid.", 400);
        const delivery = String(req.headers["x-github-delivery"] || "");
        if (!/^[a-z0-9-]{1,100}$/i.test(delivery))
          throw errorWithStatus("Webhook delivery ID is invalid.", 400);
        return json(
          res,
          202,
          await enqueue({ repository, commit, pullRequest }, delivery),
        );
      }
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        throw errorWithStatus("Cross-origin requests are not allowed.", 403);
      if (req.method === "GET" && url.pathname === "/api/session")
        return json(res, 200, {
          authRequired: auth.required,
          authenticated: auth.authenticated(req),
        });
      if (req.method === "POST" && url.pathname === "/api/session/login") {
        const body = parseBody(await readBody(req));
        res.setHeader("Set-Cookie", await auth.login(req, body.password));
        return json(res, 200, { authenticated: true, authRequired: true });
      }
      if (req.method === "POST" && url.pathname === "/api/session/logout") {
        res.setHeader("Set-Cookie", auth.logout(req));
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/api/") && !auth.authenticated(req))
        throw errorWithStatus("Sign in to your workspace.", 401);
      if (req.method === "GET" && url.pathname === "/api/workspace")
        return json(res, 200, {
          repositories,
          demoRepositories: demoRepositories(),
          aiConfigured: Boolean(aiKey),
          aiModel,
          authRequired: auth.required,
          webhooksConfigured: Boolean(webhookSecret),
          activeJob: activeJob ? jobs.get(activeJob) : null,
          analysisHistory: [...jobs.values()]
            .slice(-20)
            .reverse()
            .map(({ result, ...job }) => ({
              ...job,
              repositoryId: result?.id,
            })),
        });
      if (req.method === "POST" && url.pathname === "/api/analyses") {
        const body = parseBody(await readBody(req));
        return json(
          res,
          202,
          await enqueue(
            body.repository
              ? { repository: validateGitHubRepository(body.repository) }
              : {},
          ),
        );
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/analyses/")) {
        const job = jobs.get(url.pathname.split("/").pop());
        return json(
          res,
          job ? 200 : 404,
          job || { error: "Analysis not found." },
        );
      }
      if (
        req.method === "DELETE" &&
        url.pathname.startsWith("/api/repositories/")
      ) {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        if (!repositories.some((r) => r.id === id))
          throw errorWithStatus("Repository not found.", 404);
        if (activeJob)
          throw errorWithStatus(
            "Wait for the active analysis before removing a snapshot.",
            409,
          );
        repositories = repositories.filter((r) => r.id !== id);
        await persist();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/review") {
        const body = parseBody(await readBody(req)),
          repository = repositories.find((r) => r.id === body.repositoryId);
        if (!repository)
          throw errorWithStatus(
            "Analyze a real repository before requesting a review.",
            400,
          );
        if (body.mode !== "ai")
          return json(res, 200, {
            review: staticReview(repository),
            mode: "static",
            model: null,
          });
        if (!aiKey)
          throw errorWithStatus(
            "Set NEXORA_AI_API_KEY on the server to enable AI reviews. Engineering reviews work without a key.",
            503,
          );
        if (reviewing)
          throw errorWithStatus(
            "An AI review is already running. Wait for it to finish.",
            429,
          );
        reviewing = true;
        try {
          return json(res, 200, {
            review: await aiReview(repository, {
              key: aiKey,
              model: aiModel,
              dispatcher,
            }),
            mode: "ai",
            model: aiModel,
          });
        } finally {
          reviewing = false;
        }
      }
      if (url.pathname.startsWith("/api/"))
        throw errorWithStatus("Endpoint not found.", 404);
      if (!["GET", "HEAD"].includes(req.method))
        throw errorWithStatus("Method not allowed.", 405);
      const dist = path.join(projectRoot, "dist"),
        candidate = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (!candidate.startsWith(`${dist}${path.sep}`) && candidate !== dist)
        throw errorWithStatus("Invalid path.", 403);
      let file = candidate;
      try {
        if (!(await stat(file)).isFile()) file = path.join(dist, "index.html");
      } catch {
        if (path.extname(url.pathname))
          throw errorWithStatus("Asset not found.", 404);
        file = path.join(dist, "index.html");
      }
      const content = await readFile(file),
        mime = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
        };
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": file.includes(`${path.sep}assets${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      json(res, error.status || (error.code === "ENOENT" ? 404 : 400), {
        error:
          error.code === "ENOENT"
            ? "Build the client with npm run build."
            : error.message || "Request failed.",
      });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.once("close", () => {
    void dispatcher.close().catch(() => {});
  });
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await createApplication();
  server.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "127.0.0.1",
    () => console.log(`NEXORA listening on port ${process.env.PORT || 3001}`),
  );
  const close = () => {
    for (const child of activeGitProcesses) {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        /* Already exited. */
      }
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
