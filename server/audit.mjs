import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { satisfies, valid } from "semver";
import { fetch, EnvHttpProxyAgent } from "undici";

export async function auditDependencies(
  root,
  { fetcher = fetch, dispatcher = new EnvHttpProxyAgent() } = {},
) {
  let lock;
  try {
    const lockPath = path.join(root, "package-lock.json");
    const info = await lstat(lockPath);
    if (info.isSymbolicLink() || info.size > 5_000_000)
      return {
        status: "unsupported",
        reason: "The lockfile is a symlink or exceeds 5 MB.",
        packagesScanned: 0,
        findings: [],
      };
    lock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    return {
      status: error.code === "ENOENT" ? "unsupported" : "unavailable",
      reason:
        error.code === "ENOENT"
          ? "No npm package-lock.json found."
          : "The npm lockfile could not be read.",
      packagesScanned: 0,
      findings: [],
    };
  }
  if (!lock.packages || lock.lockfileVersion < 2)
    return {
      status: "unsupported",
      reason: "Use an npm lockfile version 2 or newer.",
      packagesScanned: 0,
      findings: [],
    };
  const packages = Object.create(null);
  for (const [location, pkg] of Object.entries(lock.packages)) {
    const name = pkg.name || location.split("node_modules/").pop();
    if (
      !location ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) ||
      !valid(pkg.version)
    )
      continue;
    if (Object.keys(packages).length >= 1500 && !packages[name]) continue;
    packages[name] ||= [];
    if (!packages[name].includes(pkg.version)) packages[name].push(pkg.version);
  }
  const packagesScanned = Object.keys(packages).length;
  if (!packagesScanned)
    return { status: "complete", packagesScanned: 0, findings: [] };
  try {
    const response = await fetcher(
      "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
      {
        dispatcher,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packages),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error("Registry unavailable");
    const data = await response.json();
    const findings = [];
    for (const [name, advisories] of Object.entries(data)) {
      if (!packages[name] || !Array.isArray(advisories)) continue;
      for (const advisory of advisories) {
        const affected = packages[name].filter((version) =>
          satisfies(version, advisory.vulnerable_versions || "", {
            includePrerelease: true,
          }),
        );
        if (!affected.length) continue;
        const severity =
          advisory.severity === "moderate"
            ? "medium"
            : ["critical", "high", "medium", "low"].includes(advisory.severity)
              ? advisory.severity
              : "medium";
        findings.push({
          id: `npm-${advisory.id}-${name}`,
          title: `${name}: ${advisory.title}`,
          category: "security",
          severity,
          file: "package-lock.json",
          line: 1,
          origin: "dependency",
          advisoryUrl: String(advisory.url || "").startsWith(
            "https://github.com/advisories/",
          )
            ? advisory.url
            : undefined,
          description: `Locked ${name} version ${affected.join(", ")} matches npm advisory ${advisory.id} (${advisory.vulnerable_versions}). Exploitability depends on how the package is used.`,
          suggestion:
            "Upgrade to a supported version outside the affected range, regenerate the lockfile, run your tests, and analyze again.",
        });
      }
    }
    return {
      status: "complete",
      packagesScanned,
      findings: findings.slice(0, 500),
      truncated: findings.length > 500,
    };
  } catch {
    return {
      status: "unavailable",
      packagesScanned,
      findings: [],
      reason:
        "The npm advisory registry could not be reached. Code checks completed; dependency vulnerability coverage is incomplete.",
    };
  }
}
