import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const id = randomUUID().slice(0, 8),
  name = `nexora-smoke-${id}`,
  volume = `nexora-smoke-data-${id}`;
const environment = {
  ...process.env,
  NEXORA_AUTH_PASSWORD: randomBytes(24).toString("hex"),
};
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete environment[key];
const docker = (...args) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
let started = false,
  volumeCreated = false;
try {
  docker("volume", "create", volume);
  volumeCreated = true;
  const args = [
    "run",
    "--detach",
    "--name",
    name,
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=64m",
    "--mount",
    `type=volume,src=${volume},dst=/var/lib/nexora`,
    "-p",
    "127.0.0.1::3001",
    "-e",
    "NEXORA_AUTH_PASSWORD",
  ];
  if (process.env.CODEX_PROXY_CERT)
    args.push(
      "--mount",
      `type=bind,src=${process.env.CODEX_PROXY_CERT},dst=/run/proxy-ca.pem,readonly`,
      "-e",
      "NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem",
      "-e",
      "GIT_SSL_CAINFO=/run/proxy-ca.pem",
    );
  args.push("nexora:production");
  docker(...args);
  started = true;
  let base = `http://${docker("port", name, "3001/tcp").split("\n")[0]}`;
  async function ready() {
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(base + "/api/health");
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Container health check timed out");
  }
  async function login() {
    const response = await fetch(base + "/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: environment.NEXORA_AUTH_PASSWORD }),
    });
    if (!response.ok) throw new Error("Container sign-in failed");
    return response.headers.get("set-cookie").split(";")[0];
  }
  await ready();
  if ((await fetch(base + "/api/workspace")).status !== 401)
    throw new Error("Unauthenticated workspace was accessible");
  let cookie = await login();
  async function request(route, body) {
    const response = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  async function analyze(body) {
    let job = await request("/api/analyses", body);
    for (let i = 0; i < 160; i++) {
      if (job.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 750));
      job = await request(`/api/analyses/${job.id}`);
    }
    if (job.status !== "complete") throw new Error(job.message);
    return job.result;
  }
  const local = await analyze({});
  if (local.filesScanned < 5 || local.dependencyAudit.status !== "complete")
    throw new Error("Container source/dependency analysis did not complete");
  console.log(
    JSON.stringify({
      containerUser: docker("exec", name, "id", "-u"),
      localFiles: local.filesScanned,
      dependencyAudit: local.dependencyAudit.status,
      packagesChecked: local.dependencyAudit.packagesScanned,
    }),
  );
  const github = await analyze({ repository: "expressjs/express" });
  if (github.filesScanned < 5 || github.source !== "github")
    throw new Error(
      "Container GitHub integration did not return source analysis",
    );
  console.log(
    JSON.stringify({
      githubRepository: github.name,
      files: github.filesScanned,
      functions: github.performance.totalFunctions,
      graphEdges: github.graph.edges.length,
    }),
  );
  docker("stop", "--time", "15", name);
  docker("start", name);
  base = `http://${docker("port", name, "3001/tcp").split("\n")[0]}`;
  await ready();
  cookie = await login();
  const saved = await request("/api/workspace");
  if (saved.repositories.length !== 2)
    throw new Error("Snapshots did not survive a container restart");
  const review = await request("/api/review", { repositoryId: "local-nexora" });
  if (review.mode !== "static" || !review.review.includes("ENGINEERING REVIEW"))
    throw new Error("Container review generation failed");
  console.log(
    JSON.stringify({
      restartPersistence: "passed",
      savedRepositories: saved.repositories.length,
      reviewMode: review.mode,
      protectedWorkspace: true,
    }),
  );
} catch (error) {
  console.error(error.message);
  if (started) {
    const diagnostic = spawnSync(
      "docker",
      ["--host=unix:///var/run/docker.sock", "logs", "--tail", "30", name],
      { env: environment, encoding: "utf8" },
    );
    console.error(diagnostic.stdout || "");
    console.error(diagnostic.stderr || "");
  }
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      docker("rm", "--force", name);
    } catch {}
  }
  if (volumeCreated) {
    try {
      docker("volume", "rm", volume);
    } catch {}
  }
}
