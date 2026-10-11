/**
 * Sprint 3.5 live UAT smoke runner.
 * Run ONLY against an explicitly authorized UAT app endpoint that can be reached
 * without Vercel deployment-level SSO. No credentials or clinical data required.
 * Usage: NEXUS_UAT_BASE_URL=https://uat.example.com node scripts/verify-step3-5-http.mjs
 */
import assert from "node:assert/strict";

const raw = process.env.NEXUS_UAT_BASE_URL;
assert.ok(raw, "NEXUS_UAT_BASE_URL is required (no production default).");
const base = new URL(raw);
assert.equal(base.protocol, "https:", "UAT endpoint must be HTTPS.");
assert.ok(!base.username && !base.password && !base.search && !base.hash);
const urls = [
  "/api/literature/review",
  "/api/literature/hits",
  "/api/literature/intake-input",
  "/api/literature/screening",
];
let failures = 0;
for (const path of urls) {
  const response = await fetch(new URL(path, base), {
    method: "GET",
    redirect: "manual",
    cache: "no-store",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 307 || response.status === 308 || response.status === 302 ||
      response.status === 401 && !response.headers.get("content-type")?.includes("application/json")) {
    console.error(`BLOCKED ${path}: HTTP ${response.status}; cannot distinguish upstream SSO from app auth`);
    failures++;
    continue;
  }
  const body = await response.json().catch(() => null);
  if (response.status !== 401 || body?.code !== "AUTHENTICATION_REQUIRED" || body?.success !== false) {
    console.error(`FAIL ${path}: expected application 401 AUTHENTICATION_REQUIRED, got ${response.status}`);
    failures++;
  } else {
    console.log(`PASS ${path}: application authentication denial 401`);
  }
}
if (failures) process.exitCode = 1;
