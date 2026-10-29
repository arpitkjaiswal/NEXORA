import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nexora-mode", "demo"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Engineering overview" }),
  ).toBeVisible();
  await expect(page.getByText("602 source files analyzed")).toBeVisible();
});

test("overview renders real dashboard components without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByText("SAMPLE DATA", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Issue breakdown" }),
  ).toBeVisible();
  await expect(page.getByLabel("Repository dependency graph")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "nexora-api TypeScript main" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("graph supports node inspection and zooming", async ({ page }) => {
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect API Gateway", exact: true })
    .click();
  await expect(page.getByText("24 source files · 3 connections")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset graph zoom" }).click();
  await expect(
    page.getByText("24 source files · 3 connections"),
  ).not.toBeVisible();
});

test("findings can be filtered and inspected with file locations", async ({
  page,
}) => {
  await page.getByLabel("Select repository").selectOption("demo-0");
  await page.getByRole("button", { name: "Code reviews", exact: true }).click();
  await page.getByLabel("Filter by severity").selectOption("high");
  await page.getByLabel("Filter by category").selectOption("security");
  await expect(page.locator(".finding-row")).toHaveCount(1);
  await page.locator(".finding-row").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("src/api/routes/projects.ts:67", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sample finding", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("global search finds a repository and changes the selection", async ({
  page,
}) => {
  await page
    .getByLabel("Search repositories and findings")
    .fill("design-system");
  await page.locator(".search-results button").first().click();
  await expect(
    page.getByRole("heading", { name: "Your repositories", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Select repository")).toHaveValue("demo-2");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("report export contains the displayed workspace and labels sample data", async ({
  page,
}) => {
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("nexora-demo-report.json");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  const report = JSON.parse(content);
  expect(report.mode).toBe("demo");
  expect(report.repositories).toHaveLength(4);
  expect(
    report.repositories.every(
      (repo: { source: string }) => repo.source === "demo",
    ),
  ).toBe(true);
});

test("local analysis produces a real snapshot and leaves demo mode", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Run analysis", exact: true }).click();
  await page.getByRole("button", { name: /Analyze this workspace/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".workspace-tabs button.selected")).toContainText(
    "Your workspace",
  );
  await expect(page.getByLabel("Select repository")).toHaveValue(
    "local-nexora",
  );
  await expect(
    page.getByText("SAMPLE DATA", { exact: true }),
  ).not.toBeVisible();
  const workspace = await page.request
    .get("/api/workspace")
    .then((r) => r.json());
  const local = workspace.repositories.find(
    (repo: { source: string }) => repo.source === "local",
  );
  expect(local.filesScanned).toBeGreaterThan(5);
  expect(local.graph.nodes.length).toBeGreaterThan(0);
  expect(local.dependencyAudit.status).toBe("complete");
  expect(local.performance.totalFunctions).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Code reviews", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate review", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Engineering review", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-output")).toContainText(
    "ENGINEERING REVIEW",
  );
  await expect(page.locator(".review-output")).toContainText("not an AI model");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Performance", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Source complexity analysis",
      exact: true,
    }),
  ).toBeVisible();
});

test("API rejects non-GitHub import destinations and cross-origin writes", async ({
  request,
}) => {
  const invalid = await request.post("/api/analyses", {
    data: { repository: "https://example.com/owner/repo" },
  });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.post("/api/analyses", {
    headers: { Origin: "https://example.com" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
});

test("mobile navigation works without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Security overview", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
