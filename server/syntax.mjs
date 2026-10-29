import { parse } from "@babel/parser";

const loops = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const functions = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ObjectMethod",
  "ClassMethod",
  "ClassPrivateMethod",
]);
const branching = new Set([
  "IfStatement",
  "ConditionalExpression",
  "CatchClause",
  "SwitchCase",
  "LogicalExpression",
  ...loops,
]);
export function inspectSyntax(source, file) {
  if (!/\.[cm]?[jt]sx?$/.test(file))
    return { parsed: false, functions: [], findings: [] };
  let ast;
  try {
    ast = parse(source, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
    });
  } catch {
    return { parsed: false, functions: [], findings: [] };
  }
  const metrics = [],
    findings = [];
  function finding(
    node,
    id,
    title,
    category,
    severity,
    description,
    suggestion,
  ) {
    findings.push({
      id: `ast-${file}-${node.start}-${id}`,
      title,
      category,
      severity,
      file,
      line: node.loc?.start.line || 1,
      description,
      suggestion,
    });
  }
  function visit(node, context = { depth: 0, fn: null }) {
    if (!node || typeof node !== "object" || !node.type) return;
    let next = { ...context };
    if (functions.has(node.type)) {
      const fn = {
        name: node.id?.name || node.key?.name || "anonymous function",
        file,
        line: node.loc?.start.line || 1,
        complexity: 1,
        lines: (node.loc?.end.line || 1) - (node.loc?.start.line || 1) + 1,
      };
      metrics.push(fn);
      next = { depth: 0, fn };
    }
    if (branching.has(node.type) && next.fn) next.fn.complexity++;
    if (loops.has(node.type)) {
      if (next.depth >= 1)
        finding(
          node,
          "nested-loop",
          "Nested iteration may scale quadratically",
          "performance",
          "medium",
          "A loop is nested inside another loop. If both depend on the same input size, work can grow as O(n²). Bounds and early exits can change the actual cost.",
          "Check input sizes and bounds. Where possible, replace repeated searches with indexed maps or sets, and benchmark representative workloads.",
        );
      next.depth++;
    }
    if (node.type === "AwaitExpression" && next.depth > 0)
      finding(
        node,
        "await-loop",
        "Sequential asynchronous work in a loop",
        "performance",
        "medium",
        "An await occurs inside a loop. This may serialize independent I/O operations, although ordering may be intentional.",
        "Confirm ordering requirements. If tasks are independent, use bounded concurrency and retain appropriate error handling.",
      );
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          "loc",
          "extra",
          "comments",
          "leadingComments",
          "trailingComments",
          "innerComments",
          "errors",
          "tokens",
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) for (const child of value) visit(child, next);
      else if (value && typeof value === "object") visit(value, next);
    }
  }
  visit(ast.program);
  for (const fn of metrics)
    if (fn.complexity > 15)
      findings.push({
        id: `complexity-${file}-${fn.line}`,
        title: `High branching complexity in ${fn.name}`,
        category: "quality",
        severity: "medium",
        file,
        line: fn.line,
        description: `This function has an estimated cyclomatic complexity of ${fn.complexity} across ${fn.lines} lines. More independent paths make behavior harder to test and maintain.`,
        suggestion:
          "Split responsibilities into smaller functions and add tests for the most important branches. Complexity is a source metric, not a measured runtime cost.",
      });
  return { parsed: true, functions: metrics, findings };
}
