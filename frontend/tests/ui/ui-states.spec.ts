import { expect, test } from "playwright/test";

test("DataTable has five distinct, accessible operational states", async ({ page }) => {
  await page.goto("http://127.0.0.1:3107/");
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
