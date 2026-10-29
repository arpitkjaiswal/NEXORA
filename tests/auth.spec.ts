import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createApplication } from "../server/index.mjs";

let server: Awaited<ReturnType<typeof createApplication>>;
let directory: string;
let address: string;
const password = randomBytes(24).toString("hex");
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "nexora-browser-auth-"));
  server = await createApplication({
    dataDir: directory,
    authPassword: password,
    production: false,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const bound = server.address();
  if (!bound || typeof bound === "string")
    throw new Error("Server did not bind");
  address = `http://127.0.0.1:${bound.port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("password sign-in, session restoration, and sign-out work in a real browser", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(address);
  await expect(
    page.getByRole("heading", { name: "A clearer view starts here." }),
  ).toBeVisible();
  await page.getByLabel("Workspace password").fill("incorrect-test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Invalid workspace password.",
  );
  await page.getByLabel("Workspace password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Engineering overview" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Engineering overview" }),
  ).toBeVisible();
  await page
    .locator(".sidebar .nav-item")
    .filter({ hasText: /^Settings/ })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer view starts here." }),
  ).toBeVisible();
  expect((await page.request.get(`${address}/api/workspace`)).status()).toBe(
    401,
  );
  expect(errors).toEqual([]);
});
