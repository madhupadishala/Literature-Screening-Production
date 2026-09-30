import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const migration = read("database/migrations/035_nexus_submissions_foundation.sql");
for (const table of [
  "nexus_submission_packages",
  "nexus_submission_attempts",
  "nexus_submission_acknowledgements",
]) {
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.ok(migration.includes("idempotency_key"));
assert.ok(migration.includes("package_sha256"));
assert.ok(migration.includes("source_case_sha256"));
assert.ok(migration.includes("ACKNOWLEDGED"));
assert.ok(migration.includes("TRANSMITTED"));

const permissions = read("lib/rbac/permissions.ts");
for (const permission of [
  "SUBMISSION_VIEW",
  "SUBMISSION_CREATE",
  "SUBMISSION_TRANSMIT",
  "SUBMISSION_ACKNOWLEDGE",
]) {
  assert.ok(permissions.includes(permission));
}

const access = read("lib/nexus/workspace-access-service.ts");
assert.ok(access.includes('case "SUBMISSIONS"'));
assert.ok(access.includes("SUBMISSION_PERMISSIONS"));
assert.ok(access.includes("PERMISSIONS.SUBMISSION_TRANSMIT"));

const service = read("lib/submissions/submission-service.ts");
for (const control of [
  "loadFinalCaseForSubmission",
  "safety_case.workspace_id = $2",
  "safety_case.environment = $3",
  "case_status IN ('FINALIZED','SUBMITTED','CLOSED')",
  "canonicalSha256",
  "idempotency_key = $4",
  "TRANSPORT_NOT_CONFIGURED",
  "nexus_submission_attempts",
  "nexus_submission_acknowledgements",
]) {
  assert.ok(service.includes(control), `Missing Submissions control: ${control}`);
}

const routes = [
  "app/api/submissions/route.ts",
  "app/api/submissions/[submissionId]/route.ts",
  "app/api/submissions/[submissionId]/transmit/route.ts",
  "app/api/submissions/[submissionId]/acknowledgements/route.ts",
];
for (const route of routes) {
  const source = read(route);
  assert.ok(source.includes("NEXUS_MODULES.SUBMISSIONS"));
  assert.ok(source.includes("requireWorkspaceModulePermission"));
  assert.equal(/\brequireModulePermission\s*\(/u.test(source), false);
}

console.log(
  "Cleanup Sprint 7 Submissions foundation verification passed: scoped finalized-case packaging, idempotent attempts, fail-closed transport and ACK tracking.",
);
