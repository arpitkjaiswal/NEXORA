import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderClient, renderServiceSpec } from "./render-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const request = renderClient(process.env.RENDER_API_KEY);
  const owners = await request("/owners?limit=100");
  const candidates = owners
    .map((item) => item.owner || item)
    .filter((owner) => owner.id);
  const owner = process.env.NEXORA_RENDER_OWNER_ID
    ? candidates.find(
        (owner) => owner.id === process.env.NEXORA_RENDER_OWNER_ID,
      )
    : candidates.length === 1
      ? candidates[0]
      : null;
  if (!owner)
    throw new Error(
      `Set NEXORA_RENDER_OWNER_ID to one of these workspaces: ${candidates.map((owner) => `${owner.name} (${owner.id})`).join(", ")}`,
    );
  console.log(`Render workspace: ${owner.name} (${owner.id})`);
  const services = await request(
    `/services?ownerId=${encodeURIComponent(owner.id)}&name=nexora&limit=100`,
  );
  const existing = services
    .map((item) => item.service || item)
    .find((service) => service.name === "nexora");
  if (
    existing &&
    existing.repo?.replace(/\.git$/, "") !==
      "https://github.com/arpitkjaiswal/NEXORA"
  )
    throw new Error(
      "A different service already uses the name nexora. It has not been changed.",
    );
  if (!process.argv.includes("--apply")) {
    console.log(
      existing
        ? `Existing service: ${existing.id}`
        : "New service prepared: Docker · Starter plan · Singapore · 1 GB persistent disk.",
    );
    console.log(
      "Preflight completed. --apply creates the paid service or deploys the existing linked service. No changes made.",
    );
    process.exit(0);
  }
  const commit = execFileSync(
    "git",
    ["rev-parse", "--verify", "HEAD^{commit}"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  const remote = execFileSync(
    "git",
    ["ls-remote", "origin", "refs/heads/main"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split(/\s/)[0];
  if (commit !== remote)
    throw new Error("Push this tested commit to origin/main before deploying.");
  let service = existing,
    deployId;
  if (service) {
    const deployment = await request(
      `/services/${encodeURIComponent(service.id)}/deploys`,
      { method: "POST", body: { commitId: commit } },
    );
    deployId = deployment.id;
  } else {
    const payload = renderServiceSpec({
      ownerId: owner.id,
      password: process.env.NEXORA_AUTH_PASSWORD,
      aiKey: process.env.NEXORA_DEPLOY_AI_KEY,
      webhookSecret: process.env.NEXORA_GITHUB_WEBHOOK_SECRET,
      githubToken: process.env.NEXORA_GITHUB_TOKEN,
    });
    const created = await request("/services", {
      method: "POST",
      body: payload,
    });
    service = created.service;
    deployId = created.deployId;
  }
  if (!service?.id)
    throw new Error(
      "Render did not return a service ID. Check the dashboard before retrying creation.",
    );
  console.log(
    `Service: ${service.id}; deployment: ${deployId || "initial build"}`,
  );
  if (!deployId)
    throw new Error(
      "Check the initial build in Render before retrying; a service was created but no deployment ID was returned.",
    );
  let lastStatus = "";
  for (let i = 0; i < 180; i++) {
    const deployment = await request(
      `/services/${encodeURIComponent(service.id)}/deploys/${encodeURIComponent(deployId)}`,
    );
    if (deployment.status !== lastStatus) {
      lastStatus = deployment.status;
      console.log(`Deployment status: ${lastStatus}`);
    }
    if (
      [
        "build_failed",
        "update_failed",
        "canceled",
        "pre_deploy_failed",
        "deactivated",
      ].includes(lastStatus)
    )
      throw new Error(
        `Render deployment ended with ${lastStatus}. Inspect the provider build logs.`,
      );
    if (lastStatus === "live") {
      if (deployment.commit?.id && deployment.commit.id !== commit)
        throw new Error(
          "Render deployed a different commit. Verify the linked branch and retry the specific tested commit.",
        );
      service = await request(`/services/${encodeURIComponent(service.id)}`);
      const url = service.serviceDetails?.url;
      if (!url?.startsWith("https://"))
        throw new Error(
          "Service is live but its HTTPS URL was not returned. Check Render service details.",
        );
      console.log(`Live Render URL: ${url}`);
      console.log(
        "Verify /api/health, sign-in, repository analysis, and persistence at this URL before reporting the app verified.",
      );
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    "Deployment did not reach live within 15 minutes. Inspect the existing deployment before retrying.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
