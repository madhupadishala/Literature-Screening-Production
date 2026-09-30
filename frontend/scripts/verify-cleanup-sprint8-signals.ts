import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const migration = read("database/migrations/036_nexus_signal_management_foundation.sql");
for (const token of [
  "CREATE TABLE IF NOT EXISTS nexus_signal_records",
  "CREATE TABLE IF NOT EXISTS nexus_signal_assessments",
  "snapshot_sha256",
  "evidence_sha256",
  "fk_signal_assessment_scope",
  "tenant_id, workspace_id, environment, id",
]) assert.ok(migration.includes(token), token);

const permissions = read("lib/rbac/permissions.ts");
for (const token of ["SIGNAL_VIEW", "SIGNAL_CREATE", "SIGNAL_ASSESS", "SIGNAL_APPROVE"]) {
  assert.ok(permissions.includes(token), token);
}

const access = read("lib/nexus/workspace-access-service.ts");
assert.ok(access.includes('case "SIGNAL_MANAGEMENT"'));
assert.ok(access.includes("SIGNAL_PERMISSIONS"));

const service = read("lib/signals/signal-service.ts");
for (const token of [
  "ALLOWED_TRANSITIONS",
  "tenant_id = $1",
  "workspace_id = $2",
  "environment = $3",
  "canonicalSha256",
  "Invalid signal transition",
  "SIGNAL_ASSESSMENT_RECORDED",
]) assert.ok(service.includes(token), token);

for (const route of [
  "app/api/signals/route.ts",
  "app/api/signals/[signalId]/route.ts",
  "app/api/signals/[signalId]/assessments/route.ts",
]) {
  const source = read(route);
  assert.ok(source.includes("requireWorkspaceModulePermission"), route);
  assert.ok(source.includes("NEXUS_MODULES.SIGNAL_MANAGEMENT"), route);
}
const assessmentRoute = read("app/api/signals/[signalId]/assessments/route.ts");
assert.ok(assessmentRoute.includes("PERMISSIONS.SIGNAL_APPROVE"));
assert.ok(assessmentRoute.includes("PERMISSIONS.SIGNAL_ASSESS"));

for (const doc of [
  "../docs/benchmarks/BENCHMARK_SIGNAL_MANAGEMENT.md",
  "../docs/requirements/URS/URS_SIGNAL_MANAGEMENT.md",
  "../docs/requirements/FRS/FRS_SIGNAL_MANAGEMENT.md",
  "../docs/user-guides/USER_GUIDE_SIGNAL_MANAGEMENT.md",
]) assert.ok(read(doc).length > 500, doc);

console.log("Cleanup Sprint 8 Signal Management foundation verification passed.");
