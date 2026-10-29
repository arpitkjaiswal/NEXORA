import { readdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { inspectSyntax } from "./syntax.mjs";

const extensions = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".css": "CSS",
  ".scss": "CSS",
  ".html": "HTML",
  ".json": "JSON",
};
const colors = {
  TypeScript: "#759ce2",
  JavaScript: "#d9c36d",
  Python: "#65b39e",
  Go: "#80c4cf",
  Rust: "#b9836d",
  CSS: "#a18cda",
  HTML: "#d99573",
  JSON: "#6e8278",
  Java: "#c77f78",
};
const skip = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nexora",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "target",
]);
const rules = [
  {
    id: "dynamic-eval",
    pattern: /\beval\s*\(/,
    title: "Dynamic code execution",
    category: "security",
    severity: "high",
    description:
      "eval() can execute arbitrary input. Review whether untrusted data can reach this call.",
    suggestion:
      "Use a strict parser such as JSON.parse or an explicit operation map instead of executing strings.",
  },
  {
    id: "html-injection",
    pattern: /(?:\.innerHTML\s*=|dangerouslySetInnerHTML)/,
    title: "Potential HTML injection",
    category: "security",
    severity: "high",
    description:
      "Raw HTML insertion can enable cross-site scripting if the content is not sanitized.",
    suggestion:
      "Render text through the framework or sanitize untrusted HTML with an established sanitizer.",
  },
  {
    id: "sql-concatenation",
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s.{0,120}(?:\$\{|['"]\s*\+)/i,
    title: "Possible SQL injection",
    category: "security",
    severity: "high",
    description:
      "This query appears to interpolate data directly into SQL. Static matching cannot establish exploitability.",
    suggestion: "Use bound parameters and validate input at the boundary.",
  },
  {
    id: "shell-exec",
    pattern: /\bexec(?:Sync)?\s*\(\s*(?:`|.*\+)/,
    title: "Review shell command construction",
    category: "security",
    severity: "high",
    description:
      "A shell command uses a template or concatenation. Untrusted interpolation may lead to command injection.",
    suggestion:
      "Use spawn or execFile with a fixed executable and separate argument array.",
  },
  {
    id: "sync-io",
    pattern: /\b(?:readFileSync|writeFileSync|execSync|readdirSync)\s*\(/,
    title: "Blocking operation on the main thread",
    category: "performance",
    severity: "medium",
    description:
      "Synchronous I/O blocks the event loop. It can become a bottleneck in request handlers.",
    suggestion:
      "Prefer asynchronous I/O in request paths. Synchronous startup scripts may be acceptable.",
  },
  {
    id: "await-loop",
    pattern: /\bfor\s*\(.*\)\s*\{?\s*await\b/,
    title: "Sequential asynchronous work in a loop",
    category: "performance",
    severity: "medium",
    description:
      "Independent operations may run sequentially. Confirm dependencies and concurrency limits before changing this.",
    suggestion:
      "For independent tasks, use a bounded concurrency pool rather than unbounded Promise.all.",
  },
  {
    id: "debug-log",
    pattern: /\bconsole\.log\s*\(/,
    title: "Debug logging in application code",
    category: "quality",
    severity: "low",
    description:
      "Console output can add noise and may expose sensitive values. Review this logging statement.",
    suggestion:
      "Use structured logging with appropriate levels and redact sensitive fields.",
  },
  {
    id: "todo",
    pattern: /(?:\/\/|#|\/\*)\s*(?:TODO|FIXME)\b/i,
    title: "Unresolved implementation note",
    category: "quality",
    severity: "low",
    description:
      "A TODO or FIXME marks unfinished work. Track it explicitly before a release.",
    suggestion:
      "Create a tracked issue or resolve the note when the implementation is complete.",
  },
  {
    id: "loose-any",
    pattern: /:\s*any\b/,
    title: "Type safety escape hatch",
    category: "quality",
    severity: "low",
    description: "An explicit any disables type checking at this boundary.",
    suggestion:
      "Use a concrete type, a generic parameter, or unknown with validation.",
  },
];

export async function analyzeRepository(
  root,
  meta = {},
  onProgress = () => {},
) {
  const started = Date.now();
  const files = [];
  let truncated = false;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (skip.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (
        entry.isFile() &&
        extensions[path.extname(entry.name)] &&
        !/(?:package-lock|pnpm-lock|yarn\.lock|\.min\.|\.test\.|\.spec\.)/.test(
          entry.name,
        )
      ) {
        if (files.length >= 2000) {
          truncated = true;
          return;
        }
        const stat = await lstat(full);
        if (stat.size > 256_000) {
          truncated = true;
          continue;
        }
        files.push({
          file: path.relative(root, full).split(path.sep).join("/"),
          full,
        });
      }
      if (files.length >= 2000) {
        truncated = true;
        return;
      }
    }
  }
  onProgress("Discovering source files", 22);
  await walk(root);
  const fileSet = new Set(files.map(({ file }) => file));
  const languages = {};
  const findings = [];
  const modules = new Map();
  const imports = [];
  const performance = {
    parsedFiles: 0,
    functions: [],
    maxComplexity: 0,
    highComplexityFunctions: 0,
  };
  let linesOfCode = 0;
  const moduleFor = (file) =>
    file.includes("/") ? file.split("/").slice(0, 2).join("/") : "root";
  onProgress("Mapping dependencies and checking code", 48);
  for (const { file, full } of files) {
    const content = await readFile(full, "utf8");
    const lines = content.split("\n");
    const syntax = inspectSyntax(content, file);
    if (syntax.parsed) {
      performance.parsedFiles++;
      performance.functions.push(...syntax.functions);
      findings.push(
        ...syntax.findings.slice(0, Math.max(0, 500 - findings.length)),
      );
      if (findings.length >= 500) truncated = true;
    }
    const language = extensions[path.extname(file)];
    languages[language] ??= {
      name: language,
      color: colors[language],
      files: 0,
      lines: 0,
    };
    languages[language].files++;
    languages[language].lines += lines.length;
    linesOfCode += lines.length;
    const module = moduleFor(file);
    modules.set(module, (modules.get(module) || 0) + 1);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of rules) {
        if (syntax.parsed && rule.id === "await-loop") continue;
        if (rule.pattern.test(line)) {
          if (findings.length >= 500) {
            truncated = true;
            continue;
          }
          const { pattern: _, ...details } = rule;
          findings.push({
            ...details,
            id: createHash("sha256")
              .update(`${file}:${i}:${rule.id}`)
              .digest("hex")
              .slice(0, 12),
            file,
            line: i + 1,
          });
        }
      }
    }
    for (const match of content.matchAll(
      /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g,
    )) {
      if (match[1].startsWith(".")) {
        const target = path.posix.normalize(
          path.posix.join(path.posix.dirname(file), match[1]),
        );
        const resolved = [
          target,
          ...Object.keys(extensions).map((ext) => `${target}${ext}`),
          ...Object.keys(extensions).map((ext) => `${target}/index${ext}`),
        ].find((candidate) => fileSet.has(candidate));
        if (resolved)
          imports.push({ source: module, target: moduleFor(resolved) });
      }
    }
  }
  const nodes = [...modules]
    .map(([id, count]) => ({
      id,
      label: id,
      files: count,
      type: /api|server|route/.test(id)
        ? "service"
        : /component|ui/.test(id)
          ? "component"
          : "module",
    }))
    .sort((a, b) => b.files - a.files)
    .slice(0, 24);
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set();
  const edges = imports.filter((e) => {
    const key = `${e.source}:${e.target}`;
    if (
      e.source === e.target ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      seen.has(key)
    )
      return false;
    seen.add(key);
    return true;
  });
  const weights = { critical: 14, high: 7, medium: 3, low: 1 };
  performance.maxComplexity = Math.max(
    0,
    ...performance.functions.map((fn) => fn.complexity),
  );
  performance.highComplexityFunctions = performance.functions.filter(
    (fn) => fn.complexity > 15,
  ).length;
  performance.totalFunctions = performance.functions.length;
  performance.functions = performance.functions
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 12);
  const security = findings.filter((f) => f.category === "security");
  const health = files.length
    ? Math.max(
        5,
        Math.round(
          100 -
            findings.reduce((n, f) => n + weights[f.severity], 0) /
              Math.max(1, files.length / 12),
        ),
      )
    : 0;
  onProgress("Preparing engineering insights", 88);
  return {
    ...meta,
    id: meta.id || createHash("sha256").update(root).digest("hex").slice(0, 12),
    name: meta.name || path.basename(root),
    owner: meta.owner || "local",
    source: meta.source || "local",
    branch: meta.branch || "work",
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    filesScanned: files.length,
    linesOfCode,
    truncated,
    health,
    securityScore: files.length ? Math.max(0, 100 - security.length * 7) : 0,
    languages: Object.values(languages).sort((a, b) => b.lines - a.lines),
    findings,
    graph: { nodes, edges },
    performance,
    history: [{ date: new Date().toISOString(), score: health }],
  };
}

export function validateGitHubRepository(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(cleaned) ||
    cleaned.endsWith("/..") ||
    cleaned.endsWith("/.")
  )
    throw new Error(
      "Enter a GitHub repository as owner/repository or its HTTPS GitHub URL.",
    );
  return cleaned;
}
