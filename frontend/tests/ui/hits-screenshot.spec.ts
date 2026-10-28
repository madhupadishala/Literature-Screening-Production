import {test,expect} from "@playwright/test";
test("Hits live workspace layout",async({page})=>{
  await page.goto("/hits");
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.getByText("Hits in queue")).toBeVisible();
  await expect(page.getByText("Mock completed")).toHaveCount(0);
  await expect(page.getByText("Synthetic fallback")).toHaveCount(0);
  await page.screenshot({path:"test-results/hits-workspace.png",fullPage:true});
});