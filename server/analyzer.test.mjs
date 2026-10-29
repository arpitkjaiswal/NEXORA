import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeRepository, validateGitHubRepository } from "./analyzer.mjs";

test("GitHub input accepts only a repository identity, never a different host or shell input", () => {
  assert.equal(
    validateGitHubRepository("https://github.com/openai/openai-node.git"),
    "openai/openai-node",
  );
  for (const value of [
    "https://evil.test/owner/repo",
    "owner/repo;ls",
    "../repo",
    "owner/..",
    "owner/repo/extra",
    "--help",
  ])
    assert.throws(() => validateGitHubRepository(value));
});

test("analyzer finds code issues and dependency edges, skips dependencies, tests, and symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nexora-test-"));
  try {
    await mkdir(path.join(root, "src", "api"), { recursive: true });
    await mkdir(path.join(root, "src", "db"), { recursive: true });
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await writeFile(
      path.join(root, "src/api/index.ts"),
      "import db from '../db/client'\neval(input)\nreadFileSync('data')\n",
    );
    await writeFile(path.join(root, "src/db/client.ts"), "export default {}\n");
    await writeFile(path.join(root, "src/ignored.test.ts"), "eval(input)");
    await writeFile(path.join(root, "node_modules/ignored.ts"), "eval(input)");
    await symlink("/etc/passwd", path.join(root, "src/external.ts"));
    const result = await analyzeRepository(root);
    assert.equal(result.filesScanned, 2);
    assert.equal(result.findings.length, 2);
    assert.equal(result.findings[0].severity, "high");
    assert.equal(result.findings[0].line, 2);
    assert.deepEqual(result.graph.edges, [
      { source: "src/api", target: "src/db" },
    ]);
    assert.equal(result.languages[0].name, "TypeScript");
    assert.ok(result.health < 100);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("empty repositories return an honest empty snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nexora-empty-"));
  try {
    const result = await analyzeRepository(root);
    assert.equal(result.filesScanned, 0);
    assert.equal(result.health, 0);
    assert.equal(result.securityScore, 0);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.graph.nodes, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extensionless sibling imports and directory index imports resolve to actual files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nexora-imports-"));
  try {
    await mkdir(path.join(root, "src/components"), { recursive: true });
    await writeFile(
      path.join(root, "src/App.tsx"),
      "import Button from './Button'\nimport Components from './components'\nimport Missing from './missing'\n",
    );
    await writeFile(
      path.join(root, "src/Button.tsx"),
      "export default function Button() {}",
    );
    await writeFile(
      path.join(root, "src/components/index.ts"),
      "export default {}",
    );
    const result = await analyzeRepository(root);
    assert.deepEqual(result.graph.edges, [
      { source: "src/App.tsx", target: "src/Button.tsx" },
      { source: "src/App.tsx", target: "src/components" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
