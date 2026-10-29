import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createApplication } from "./index.mjs";
import { createAuth } from "./auth.mjs";
import { auditDependencies } from "./audit.mjs";
import { aiReview } from "./review.mjs";

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "nexora-api-"));
  await mkdir(path.join(root, "source"));
  await writeFile(path.join(root, "source", "app.ts"), 'console.log("test")\n');
  const server = await createApplication({
    dataDir: path.join(root, "state"),
    sourceRoot: path.join(root, "source"),
    authPassword: "",
    ...options,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    root,
    server,
    base,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    },
  };
}
async function post(base, url, body, headers = {}) {
  return fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
async function complete(base, id, headers = {}) {
  for (let i = 0; i < 100; i++) {
    const job = await fetch(`${base}/api/analyses/${id}`, { headers }).then(
      (r) => r.json(),
    );
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Analysis did not complete");
}

test("production refuses an unset/short password and issues secure, revocable sessions", async () => {
  await assert.rejects(
    createAuth("", { production: true }),
    /NEXORA_AUTH_PASSWORD/,
  );
  await assert.rejects(
    createAuth("short", { production: true }),
    /12 characters/,
  );
  const password = randomBytes(18).toString("hex");
  const auth = await createAuth(password, { production: true });
  const req = { headers: {}, socket: { remoteAddress: "test" } };
  await assert.rejects(auth.login(req, "wrong"), /Invalid workspace password/);
  const cookie = await auth.login(req, password);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  const signedIn = { ...req, headers: { cookie: cookie.split(";")[0] } };
  assert.equal(auth.authenticated(signedIn), true);
  auth.logout(signedIn);
  assert.equal(auth.authenticated(signedIn), false);
});

test("workspace API requires authentication, rejects hostile origins, and never returns credentials", async () => {
  const password = randomBytes(18).toString("hex"),
    app = await fixture({ authPassword: password });
  try {
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
    assert.equal((await fetch(app.base + "/api/workspace")).status, 401);
    assert.equal(
      (
        await post(
          app.base,
          "/api/session/login",
          { password },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    const response = await post(app.base, "/api/session/login", { password });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const workspace = await fetch(app.base + "/api/workspace", {
      headers: { Cookie: cookie },
    });
    assert.equal(workspace.status, 200);
    assert.ok(!(await workspace.text()).includes(password));
    await post(app.base, "/api/session/logout", {}, { Cookie: cookie });
    assert.equal(
      (
        await fetch(app.base + "/api/workspace", {
          headers: { Cookie: cookie },
        })
      ).status,
      401,
    );
  } finally {
    await app.close();
  }
});

test("analyses persist, expose generated reviews, and survive a server restart", async () => {
  const app = await fixture();
  try {
    const queued = await post(app.base, "/api/analyses", {}).then((r) =>
      r.json(),
    );
    const job = await complete(app.base, queued.id);
    assert.equal(job.status, "complete");
    assert.equal(job.result.filesScanned, 1);
    assert.match(job.result.automatedReview, /ENGINEERING REVIEW/);
    const review = await post(app.base, "/api/review", {
      repositoryId: job.result.id,
    }).then((r) => r.json());
    assert.equal(review.mode, "static");
    assert.match(review.review, /not an AI model/);
    const saved = JSON.parse(
      await readFile(path.join(app.root, "state", "workspace.json"), "utf8"),
    );
    assert.equal(saved.repositories.length, 1);
    assert.equal(saved.jobs[0].status, "complete");
    await new Promise((resolve) => app.server.close(resolve));
    const restarted = await createApplication({
      dataDir: path.join(app.root, "state"),
      sourceRoot: path.join(app.root, "source"),
      authPassword: "",
    });
    restarted.listen(0, "127.0.0.1");
    await once(restarted, "listening");
    try {
      const state = await fetch(
        `http://127.0.0.1:${restarted.address().port}/api/workspace`,
      ).then((r) => r.json());
      assert.equal(state.repositories.length, 1);
      assert.equal(state.analysisHistory[0].status, "complete");
    } finally {
      await new Promise((resolve) => restarted.close(resolve));
    }
  } finally {
    await app.close();
  }
});

test("signed GitHub webhook handshakes are accepted, invalid signatures are rejected", async () => {
  const secret = randomBytes(24).toString("hex"),
    app = await fixture({ webhookSecret: secret });
  try {
    const payload = JSON.stringify({ zen: "test" });
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    const response = await fetch(app.base + "/api/webhooks/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-Hub-Signature-256": signature,
      },
      body: payload,
    });
    assert.equal(response.status, 200);
    assert.equal(
      (
        await post(
          app.base,
          "/api/webhooks/github",
          { zen: "test" },
          { "X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=invalid" },
        )
      ).status,
      403,
    );
    const state = await fetch(app.base + "/api/workspace").then((r) =>
      r.json(),
    );
    assert.equal(state.analysisHistory.length, 0);
  } finally {
    await app.close();
  }
});

test("dependency audit uses locked versions and surfaces real advisory metadata without installing code", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nexora-audit-"));
  try {
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture" },
          "node_modules/lodash": { version: "4.17.19" },
          "node_modules/safe-package": { version: "2.0.0" },
        },
      }),
    );
    const result = await auditDependencies(root, {
      fetcher: async (url, options) => {
        assert.equal(
          url,
          "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        );
        assert.deepEqual(JSON.parse(options.body), {
          lodash: ["4.17.19"],
          "safe-package": ["2.0.0"],
        });
        return {
          ok: true,
          json: async () => ({
            lodash: [
              {
                id: 1106913,
                title: "Command Injection",
                severity: "high",
                vulnerable_versions: "<4.17.21",
                url: "https://github.com/advisories/GHSA-35jh-r3h4-6jhm",
              },
            ],
            "safe-package": [
              {
                id: 1,
                title: "Old version",
                severity: "moderate",
                vulnerable_versions: "<1.0.0",
              },
            ],
          }),
        };
      },
    });
    assert.equal(result.status, "complete");
    assert.equal(result.packagesScanned, 2);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].origin, "dependency");
    const offline = await auditDependencies(root, {
      fetcher: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(offline.status, "unavailable");
    assert.equal(offline.findings.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AI adapter handles provider success and errors without claiming live-provider validation", async () => {
  const repository = {
    owner: "test",
    name: "fixture",
    filesScanned: 1,
    findings: [],
    graph: { nodes: [], edges: [] },
  };
  const success = await aiReview(repository, {
    key: "test-only-key",
    model: "test-model",
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(JSON.parse(options.body).model, "test-model");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Mocked provider response" } }],
        }),
      };
    },
  });
  assert.equal(success, "Mocked provider response");
  await assert.rejects(
    aiReview(repository, {
      key: "test-only-key",
      model: "test-model",
      fetcher: async () => ({ ok: false, status: 401 }),
    }),
    /HTTP 401/,
  );
});
