const finding = (
  id,
  title,
  category,
  severity,
  file,
  line,
  description,
  suggestion,
) => ({ id, title, category, severity, file, line, description, suggestion });
export function demoRepositories() {
  const now = new Date();
  const make = (name, health, count, index) => {
    const findings = [
      finding(
        "n-plus-one",
        "Potential N+1 query in user service",
        "performance",
        "high",
        "src/services/user.service.ts",
        142,
        "The sample user resolver fetches each team membership separately. At scale, this can create one database round trip per user.",
        "Batch membership lookups by user ID and use a request-scoped data loader.",
      ),
      finding(
        "input-validation",
        "Missing input validation on API route",
        "security",
        "high",
        "src/api/routes/projects.ts",
        67,
        "The sample project endpoint accepts an unvalidated request body before passing it to the service layer.",
        "Validate the request with a strict schema and reject unknown properties.",
      ),
      finding(
        "cache",
        "An opportunity to cache repeated queries",
        "performance",
        "medium",
        "src/services/analytics.ts",
        89,
        "The sample analytics service repeatedly computes a summary that changes infrequently.",
        "Use a short-lived cache with explicit invalidation when project data changes.",
      ),
      finding(
        "any",
        "Improve the API response types",
        "quality",
        "low",
        "src/types/api.ts",
        24,
        "An any type in the sample API client hides the structure of a response.",
        "Define a typed response and validate the payload at the network boundary.",
      ),
      finding(
        "html",
        "Review unsanitized HTML rendering",
        "security",
        "medium",
        "src/components/Markdown.tsx",
        38,
        "The sample renderer inserts generated markup without an explicit sanitization boundary.",
        "Sanitize rendered HTML and use a restrictive allowlist for supported tags.",
      ),
      finding(
        "logging",
        "Debug statement in production path",
        "quality",
        "low",
        "src/middleware/logger.ts",
        12,
        "A sample debug statement emits the full request object.",
        "Use structured logs that redact authorization headers and personal data.",
      ),
    ]
      .slice(0, count)
      .map((f) => ({ ...f, id: `${name}-${f.id}` }));
    return {
      id: `demo-${index}`,
      name,
      owner: "nexora",
      source: "demo",
      branch: "main",
      analyzedAt: now.toISOString(),
      durationMs: 1830 + index * 420,
      filesScanned: [248, 184, 96, 74][index],
      linesOfCode: [28432, 18654, 8420, 6240][index],
      health,
      securityScore: [94, 96, 100, 97][index],
      languages: [
        { name: "TypeScript", color: "#759ce2", files: 180, lines: 18000 },
        { name: "JavaScript", color: "#d9c36d", files: 40, lines: 3800 },
        { name: "CSS", color: "#a18cda", files: 28, lines: 2300 },
      ],
      findings,
      history: [73, 78, 76, 84, 82, 88, health].map((score, day) => ({
        date: new Date(now.getTime() - (6 - day) * 86400000).toISOString(),
        score: score - index,
      })),
      graph: {
        nodes: [
          { id: "gateway", label: "API Gateway", type: "service", files: 24 },
          { id: "auth", label: "Auth service", type: "service", files: 38 },
          { id: "users", label: "User service", type: "service", files: 42 },
          {
            id: "projects",
            label: "Project service",
            type: "service",
            files: 56,
          },
          { id: "database", label: "PostgreSQL", type: "database", files: 12 },
          { id: "cache", label: "Redis cache", type: "database", files: 8 },
        ],
        edges: [
          { source: "gateway", target: "auth" },
          { source: "gateway", target: "users" },
          { source: "gateway", target: "projects" },
          { source: "auth", target: "database" },
          { source: "users", target: "database" },
          { source: "projects", target: "database" },
          { source: "users", target: "cache" },
        ],
      },
    };
  };
  return [
    make("nexora-api", 92, 6, 0),
    make("web-client", 88, 4, 1),
    make("design-system", 98, 2, 2),
    make("auth-service", 94, 3, 3),
  ];
}
