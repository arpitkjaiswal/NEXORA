import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectSyntax } from "./syntax.mjs";

test("syntax analysis measures branching and recognizes multiline nested loops and await", () => {
  const code =
    "async function work(items) {\n for (const x of items) {\n  for (const y of items) {\n   if(x) await run(y)\n  }\n }\n}";
  const result = inspectSyntax(code, "src/work.ts");
  assert.equal(result.parsed, true);
  assert.equal(result.functions.length, 1);
  assert.equal(result.functions[0].complexity, 4);
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].line, 3);
  assert.equal(result.findings[1].line, 4);
});
test("syntax analysis does not confuse loops inside strings or separate functions with nested loops", () => {
  const result = inspectSyntax(
    'const text = "for (x) for (y) await run()";\nfor (const x of data) { const fn = async () => { await run(x) } }',
    "app.js",
  );
  assert.equal(result.findings.length, 0);
  assert.equal(
    inspectSyntax("def function(): pass", "script.py").parsed,
    false,
  );
  assert.equal(inspectSyntax("invalid javascript {", "app.ts").parsed, false);
});
