import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const routes = ["/hits", "/screening", "/review", "/intake", "/cases", "/submissions"];
const output = process.env.UI_VISUAL_OUT ?? "test-results/ui-comparison";
const baseline = process.env.UI_BASE_URL ?? "http://127.0.0.1:3001";
const candidate = process.env.UI_BRANCH_URL ?? "http://127.0.0.1:3000";
const session = [];
mkdirSync(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const route of routes) {
    for (const [label, host] of [["base", baseline], ["branch", candidate]]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const response = await page.goto(host + route, { waitUntil: "networkidle" });
      const actual = new URL(page.url()).pathname;
      const file = join(output, label + "-" + route.slice(1) + ".png");
      await page.screenshot({ path: file, fullPage: true });
      session.push({
        route,
        variant: label,
        status: response?.status() ?? null,
        actualPath: actual,
        screenshot: file,
        authenticatedRoute: actual === route,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(output, "routes.json"), JSON.stringify(session, null, 2));
const diverted = session.filter(record => !record.authenticatedRoute || record.status !== 200);
console.log(JSON.stringify({ routes: session, diverted: diverted.length }, null, 2));
if (diverted.length) {
  console.error("Visual comparison is not qualified: routes redirect or do not return 200.");
  process.exitCode = 1;
}
