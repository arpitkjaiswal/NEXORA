import { fetch, EnvHttpProxyAgent } from "undici";

export function renderServiceSpec({
  ownerId,
  password,
  aiKey,
  webhookSecret,
  githubToken,
}) {
  if (!ownerId || !/^[a-z0-9-]+$/i.test(ownerId))
    throw new Error("Select a valid Render workspace ID.");
  if (typeof password !== "string" || password.length < 12)
    throw new Error(
      "NEXORA_AUTH_PASSWORD must contain at least 12 characters.",
    );
  const envVars = [
    { key: "NODE_ENV", value: "production" },
    { key: "HOST", value: "0.0.0.0" },
    { key: "PORT", value: "10000" },
    { key: "NEXORA_DATA_DIR", value: "/var/lib/nexora" },
    { key: "NEXORA_AUTH_PASSWORD", value: password },
  ];
  for (const [key, value] of [
    ["NEXORA_AI_API_KEY", aiKey],
    ["NEXORA_GITHUB_WEBHOOK_SECRET", webhookSecret],
    ["NEXORA_GITHUB_TOKEN", githubToken],
  ])
    if (value) envVars.push({ key, value });
  return {
    type: "web_service",
    name: "nexora",
    ownerId,
    repo: "https://github.com/arpitkjaiswal/NEXORA",
    branch: "main",
    autoDeployTrigger: "checksPass",
    envVars,
    serviceDetails: {
      runtime: "docker",
      plan: "starter",
      region: "singapore",
      healthCheckPath: "/api/health",
      numInstances: 1,
      disk: { name: "nexora-data", mountPath: "/var/lib/nexora", sizeGB: 1 },
      envSpecificDetails: {
        dockerfilePath: "./Dockerfile",
        dockerContext: ".",
      },
    },
  };
}

export function renderClient(
  key,
  { fetcher = fetch, dispatcher = new EnvHttpProxyAgent() } = {},
) {
  if (!key)
    throw new Error(
      "Add RENDER_API_KEY securely in environment settings before deploying.",
    );
  return async function request(route, options = {}) {
    if (!route.startsWith("/") || route.startsWith("//"))
      throw new Error("Invalid Render API route.");
    const response = await fetcher(`https://api.render.com/v1${route}`, {
      dispatcher,
      signal: AbortSignal.timeout(60000),
      ...options,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok)
      throw new Error(
        `Render API returned HTTP ${response.status}. ${response.status === 401 ? "Check the Render API key." : response.status === 402 ? "The selected plan needs billing configured." : "Check Render account permissions and service configuration."}`,
      );
    return response.status === 204 ? null : response.json();
  };
}
