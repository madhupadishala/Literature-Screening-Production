import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const offline =
  process.argv.includes("--offline") ||
  process.env.ALLOW_OFFLINE_VALIDATION?.trim().toLowerCase() === "true";
const checks = [];

for (const file of [
  "database/migrations/013_production_release_governance.sql",
  "scripts/seed-enterprise-demo.mjs",
  "scripts/verify-enterprise-demo.mjs",
  "app/api/literature/adhoc-search/route.ts",
  "app/api/literature/hits/route.ts",
  "app/api/literature/screening/route.ts",
  "app/api/literature/intake-input/route.ts",
  "app/api/audit/search/route.ts",
  "app/api/monitoring/summary/route.ts",
  "app/api/monitoring/performance/route.ts",
]) {
  await access(path.join(root, file));
}
checks.push(pass("production-files", "Required Search-to-release production files exist."));

const registry = await readFile(path.join(root, "lib/database/migration-registry.ts"), "utf8");
for (let migration = 1; migration <= 13; migration += 1) {
  const id = String(migration).padStart(3, "0");
  if (!registry.includes(`id: "${id}"`))
    throw new Error(`Migration ${id} is missing from the required registry.`);
}
checks.push(pass("migration-registry", "Migrations 001-013 are registered as required."));

const productionPages = await Promise.all(
  [
    "app/page.tsx",
    "app/literature-search/page.tsx",
    "app/hits/page.tsx",
    "app/screening/page.tsx",
    "app/workflow/page.tsx",
    "app/reports/page.tsx",
  ].map(async (file) => [file, await readFile(path.join(root, file), "utf8")]),
);
const placeholders = productionPages.filter(([, content]) =>
  /workspace will be connected here|mock implementation|TODO_PLACEHOLDER/i.test(content),
);
if (placeholders.length)
  throw new Error(`Placeholder UI remains in: ${placeholders.map(([file]) => file).join(", ")}`);
checks.push(
  pass(
    "no-client-placeholders",
    "Primary client-demo routes contain no placeholder implementation.",
  ),
);

run("typescript", process.execPath, [
  path.join(root, "node_modules/typescript/bin/tsc"),
  "--noEmit",
]);
run("eslint", process.execPath, [
  path.join(root, "node_modules/eslint/bin/eslint.js"),
  "app/page.tsx",
  "app/literature-search/page.tsx",
  "app/hits/page.tsx",
  "app/screening/page.tsx",
  "app/workflow/page.tsx",
  "app/reports/page.tsx",
  "app/api/literature/adhoc-search/route.ts",
  "app/api/literature/hits/route.ts",
  "app/api/literature/screening/route.ts",
  "app/api/literature/intake-input/route.ts",
  "app/api/audit/search/route.ts",
  "app/api/monitoring/summary/route.ts",
  "app/api/monitoring/performance/route.ts",
  "lib/literature",
  "lib/rbac",
  "lib/audit",
  "lib/enterprise",
  "--max-warnings",
  "0",
]);

if (process.env.DATABASE_URL?.trim()) {
  run("demo-dataset", process.execPath, [path.join(root, "scripts/verify-enterprise-demo.mjs")]);
} else if (offline) {
  checks.push(
    skip(
      "demo-dataset",
      "DATABASE_URL is unavailable; runtime dataset verification was explicitly skipped.",
    ),
  );
} else {
  throw new Error("DATABASE_URL is required for authoritative end-to-end validation.");
}

if (process.env.RELEASE_BASE_URL?.trim()) {
  const baseUrl = new URL(process.env.RELEASE_BASE_URL).origin;
  for (const endpoint of ["/api/health/live", "/api/health/ready"]) {
    const response = await fetch(new URL(endpoint, baseUrl), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}.`);
    checks.push(
      pass(`http-${endpoint.split("/").pop()}`, `${endpoint} returned a successful response.`),
    );
  }
} else if (offline) {
  checks.push(
    skip(
      "http-smoke",
      "RELEASE_BASE_URL is unavailable; deployed HTTP probes were explicitly skipped.",
    ),
  );
} else {
  throw new Error("RELEASE_BASE_URL is required for authoritative end-to-end validation.");
}

const passed = checks.every((check) => check.status !== "failed");
const complete = checks.every((check) => check.status === "passed");
console.log(
  JSON.stringify(
    {
      passed,
      complete,
      mode: offline ? "offline" : "authoritative",
      checkedAt: new Date().toISOString(),
      checks,
    },
    null,
    2,
  ),
);
if (!passed || (!complete && !offline)) process.exitCode = 1;

function run(id, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error(`${id} validation failed with exit code ${result.status}.`);
  }
  checks.push(pass(id, `${id} validation passed.`));
}
function pass(id, message) {
  return { id, status: "passed", message };
}
function skip(id, message) {
  return { id, status: "skipped", message };
}
