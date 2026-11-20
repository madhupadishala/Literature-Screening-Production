import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.resolve(root, p), "utf8");

for (const page of [
  "app/literature/dashboard/page.tsx",
  "app/hits/page.tsx",
  "app/screening/page.tsx",
  "app/review/page.tsx",
  "app/literature/admin/page.tsx",
]) {
  const source = read(page);
  assert.ok(source.includes("ApplicationShell"), `${page} must use the governed ApplicationShell.`);
  assert.ok(source.includes('module="LITERATURE"'), `${page} must be scoped to Literature navigation.`);
  assert.ok(!source.includes('import Navigation from "@/components/Navigation"'), `${page} mounts primary navigation directly.`);
}

const hits = read("app/hits/page.tsx");
assert.ok(hits.includes('className="nh-metrics"'));
assert.ok(hits.includes("PREVIEW FIXTURES — NOT LIVE SEARCH"));
assert.ok(hits.includes("No AI determination made in this workspace"));
assert.ok(hits.includes("Approve Hits"));
assert.ok(hits.includes("Flag for review"));
assert.ok(hits.includes("Dismiss"));

const screening = read("app/screening/page.tsx");
assert.ok(screening.includes("OperationalScreenHeader"));
assert.ok(screening.includes("Decision authority"));
assert.ok(screening.includes("authorized human reviewer"));

const review = read("app/review/page.tsx").toLowerCase();
for (const value of ["medical review workspace", "seriousness", "listedness / expectedness", "causality", "evidence-first medical review"]) {
  assert.ok(review.includes(value), `Medical Review UX missing ${value}`);
}

const admin = read("app/literature/admin/page.tsx");
assert.ok(admin.includes("RBAC controlled"));
assert.ok(admin.includes("Administrative boundary"));

console.log("Cleanup Sprint 12 Literature operational UX verification passed.");
