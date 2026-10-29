import { test } from "node:test";
import assert from "node:assert/strict";
import { renderClient, renderServiceSpec } from "../scripts/render-api.mjs";

test("Render deployment specifies durable storage, required authentication, health checks, and the requested repository", () => {
  assert.throws(
    () => renderServiceSpec({ ownerId: "tea-test", password: "short" }),
    /12 characters/,
  );
  const spec = renderServiceSpec({
    ownerId: "tea-test",
    password: "test-only-password",
  });
  assert.equal(spec.repo, "https://github.com/arpitkjaiswal/NEXORA");
  assert.equal(spec.branch, "main");
  assert.equal(spec.serviceDetails.disk.mountPath, "/var/lib/nexora");
  assert.equal(spec.serviceDetails.plan, "starter");
  assert.equal(spec.serviceDetails.healthCheckPath, "/api/health");
  assert.equal(
    spec.envVars.find((item) => item.key === "NEXORA_AUTH_PASSWORD").value,
    "test-only-password",
  );
  assert.ok(!spec.envVars.some((item) => item.key === "RENDER_API_KEY"));
});
test("Render client authenticates only to the fixed provider endpoint and does not expose response bodies on errors", async () => {
  assert.throws(() => renderClient(""), /RENDER_API_KEY/);
  const request = renderClient("test-only-token", {
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.render.com/v1/owners");
      assert.equal(options.headers.Authorization, "Bearer test-only-token");
      return { ok: true, json: async () => [{ owner: { id: "tea-test" } }] };
    },
  });
  assert.equal((await request("/owners"))[0].owner.id, "tea-test");
  await assert.rejects(
    request("//other-host.example"),
    /Invalid Render API route/,
  );
  const error = renderClient("test-only-token", {
    fetcher: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ secret: "do-not-echo" }),
    }),
  });
  await assert.rejects(
    error("/owners"),
    /^Error: Render API returned HTTP 401\. Check the Render API key\.$/,
  );
});
