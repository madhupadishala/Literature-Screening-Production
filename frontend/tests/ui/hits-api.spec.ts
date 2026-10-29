import { expect, test } from "playwright/test";

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
    await expect(page.getByText("Live Hits could not be loaded", {exact: false}).first()).toBeVisible();
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
