import { expect, test } from "playwright/test";

test("DataTable has five distinct, accessible operational states", async ({ page }) => {
  page.on("pageerror", error => console.error("BROWSER ERROR:", error.message));
  page.on("console", message => console.log("BROWSER CONSOLE:", message.text()));
  await page.goto("http://127.0.0.1:3107/");
  console.log("BROWSER DOM:", (await page.locator("body").innerText()).slice(0, 1200));
  const expected = ["loading", "empty", "error", "readonly", "finalized"];
  for (const state of expected) {
    await expect(page.locator(`[data-table-state="${state}"]`)).toHaveCount(1);
  }

  await expect(page.getByText("The regulated service returned HTTP 500.")).toBeVisible();
  await expect(page.getByText("No safety records were returned by the server.")).toBeVisible();
  await expect(page.getByText("Active edit lease belongs to another reviewer.")).toBeVisible();
  await expect(page.getByText("AUD-2026-001")).toBeVisible();

  const empty = await page.locator('[data-table-state="empty"]').screenshot();
  const error = await page.locator('[data-table-state="error"]').screenshot();
  expect(empty.equals(error)).toBe(false);

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("retry-count")).toHaveText("1");
  await page.screenshot({ path: "test-results/ui-five-states.png", fullPage: true });
});
