import { expect, test } from "playwright/test";

test.beforeEach(async ({page}) => {
  page.on("pageerror", error => console.error("HITS BROWSER ERROR:", error.message));
  page.on("console", message => console.log("HITS CONSOLE:", message.text()));
});

const liveHit = {
  hit_id: "HIT-LIVE-101",
  package_id: "PKG-LIVE-101",
  database_package_id: "PKG-LIVE-101",
  hits_result_id: "RES-LIVE-101",
  title: "Live safety publication for testing",
  product_name: "Study drug",
  patient_safety_status: "POSITIVE",
  evidence_sentence: "Mock evidence for controlled regression",
};

async function setup(page: import("playwright").Page, status: number, body: unknown) {
  await page.route("**/api/literature/hits?*", async route => {
    await route.fulfill({status, contentType: "application/json", body: JSON.stringify(body)});
  });
  await page.route("**/api/v1/my-assignments?*", async route => {
    await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true, data: {records: []}})});
  });
  await page.route("**/api/v1/hits/self-assign", async route => {
    await route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({success: true})});
  });
}

test("200 data shows the live worklist", async ({page}) => {
  await setup(page, 200, {data: {hits: [liveHit]}});
  await page.goto("http://127.0.0.1:3108/");
  console.log("HITS TEST DOM:", (await page.locator("body").innerText()).slice(0,500));
  await expect(page.getByText("Live safety publication for testing")).toBeVisible();
  await expect(page.getByText("Live Hits could not be loaded", {exact: false})).toHaveCount(0);
});

test("200 empty is a genuine empty state", async ({page}) => {
  await setup(page, 200, {data: {hits: []}});
  await page.goto("http://127.0.0.1:3108/");
  await expect(page.getByText("No matching records.")).toBeVisible();
  await expect(page.getByText("Live Hits could not be loaded", {exact: false})).toHaveCount(0);
  await page.screenshot({path: "test-results/hits-200-empty.png", fullPage: true});
});

for (const caseName of ["500", "malformed"] as const) {
  test(`${caseName} is an error, never an empty worklist`, async ({page}) => {
    await setup(page, caseName === "500" ? 500 : 200, caseName === "500" ? {error: "server error"} : {data: {hits: null}});
    await page.goto("http://127.0.0.1:3108/");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("alert").first()).toContainText("Could not load hits. Please retry.");
    await expect(page.getByRole("alert").first()).toContainText(caseName === "500" ? "HTTP 500" : "invalid response");
    await expect(page.locator(".nh-metrics strong")).toHaveText(["—", "—", "—", "—"]);
    await expect(page.getByRole("button", {name: "Retry"})).toBeVisible();
    await expect(page.getByText("No matching records.")).toHaveCount(0);
    await page.screenshot({path: `test-results/hits-${caseName}-error.png`, fullPage: true});
  });
}

test("lease held by another reviewer prevents editing", async ({page}) => {
  await setup(page, 200, {data: {hits: [liveHit]}});
  await page.route("**/api/v1/hits/records/*/lock", async route => {
    await route.fulfill({status: 423, contentType: "application/json", body: JSON.stringify({error: "locked"})});
  });
  await page.goto("http://127.0.0.1:3108/");
  await expect(page.getByText("Live safety publication for testing")).toBeVisible();
  await page.getByRole("button", {name: "Actions"}).first().click();
  await page.getByRole("button", {name: "Accept and Review"}).click();
  await expect(page.getByText("Locked by another reviewer")).toBeVisible();
  await expect(page.getByRole("button", {name: "Approve Hits"})).toBeDisabled();
});

test("Retry recovers from initial HTTP 500", async ({page}) => {
  let attempts = 0;
  await page.route("**/api/literature/hits?*", async route => {
    attempts++;
    const ok = attempts > 1;
    await route.fulfill({
      status: ok ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(ok ? {data: {hits: [liveHit]}} : {error: "temporary failure"}),
    });
  });
  await page.route("**/api/v1/my-assignments?*", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({success: true, data: {records: []}}),
    });
  });
  await page.goto("http://127.0.0.1:3108/");
  await expect(page.getByRole("alert").first()).toContainText("Could not load hits. Please retry.");
  await expect(page.locator(".nh-metrics strong")).toHaveText(["—", "—", "—", "—"]);
  await page.getByRole("button", {name: "Retry"}).click();
  await expect(page.getByText("Live safety publication for testing")).toBeVisible();
  await expect(page.locator(".nh-metrics strong").first()).toHaveText("1");
  await expect(page.getByText("Could not load hits. Please retry.")).toHaveCount(0);
  expect(attempts).toBeGreaterThanOrEqual(2);
});
