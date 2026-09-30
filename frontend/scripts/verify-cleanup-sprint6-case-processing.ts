import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const migration = read("database/migrations/034_nexus_safety_workspace_scope.sql");
for (const table of [
  "safety_sources",
  "safety_intake_records",
  "safety_cases",
  "intake_input_exports",
]) {
  assert.ok(
    migration.includes(`ALTER TABLE ${table}`),
    `Migration 034 must scope ${table}`,
  );
}
assert.ok(migration.includes("workspace_id uuid"));
assert.ok(migration.includes("environment text"));
assert.ok(migration.includes("fk_safety_cases_workspace"));
assert.ok(migration.includes("uq_safety_cases_scope_key"));

const caseService = read("lib/safety/common/safety-case-service.ts");
assert.ok(caseService.includes("requireSafetyWorkspaceScope"));
assert.ok(caseService.includes("workspace_id, environment, case_key"));
assert.ok(caseService.includes("intake.workspace_id = $2"));
assert.ok(caseService.includes("intake.environment = $3"));

const caseProcessing = read("lib/safety/case-processing/case-processing-service.ts");
assert.ok(caseProcessing.includes("safety_case.workspace_id = $2"));
assert.ok(caseProcessing.includes("safety_case.environment = $3"));

const caseRoutes = [
  "app/api/safety/cases/[caseId]/assessments/route.ts",
  "app/api/safety/cases/[caseId]/assignment/route.ts",
  "app/api/safety/cases/[caseId]/assist/[suggestionId]/route.ts",
  "app/api/safety/cases/[caseId]/evidence/[packageId]/route.ts",
  "app/api/safety/cases/[caseId]/evidence/route.ts",
  "app/api/safety/cases/[caseId]/exports/[exportId]/route.ts",
  "app/api/safety/cases/[caseId]/exports/route.ts",
  "app/api/safety/cases/[caseId]/finalization/route.ts",
  "app/api/safety/cases/[caseId]/narratives/route.ts",
  "app/api/safety/cases/[caseId]/queries/[queryId]/route.ts",
  "app/api/safety/cases/[caseId]/reviews/medical/route.ts",
  "app/api/safety/cases/[caseId]/reviews/qc/route.ts",
  "app/api/safety/cases/[caseId]/route.ts",
  "app/api/safety/cases/[caseId]/submit-qc/route.ts",
  "app/api/safety/cases/[caseId]/versions/route.ts",
];

for (const route of caseRoutes) {
  const source = read(route);
  assert.ok(
    source.includes("requireWorkspaceModulePermission"),
    `${route} must use canonical workspace/module authorization`,
  );
  assert.ok(
    source.includes("assertSafetyCaseInScope(principal, caseId)"),
    `${route} must enforce persisted case workspace ownership`,
  );
  assert.equal(
    /\brequireModulePermission\s*\(/u.test(source),
    false,
    `${route} must not call the legacy module guard`,
  );
}

const finalization = read("app/api/safety/cases/[caseId]/finalization/route.ts");
assert.ok(finalization.includes("PERMISSIONS.CASE_FINALIZE"));
const evidence = read("lib/safety/case-release/case-release-service.ts");
assert.ok(evidence.includes("caseSha256"));
assert.ok(evidence.includes("packageSha256"));
assert.ok(evidence.includes("caseVersionImmutable: true"));

console.log(
  `Cleanup Sprint 6 Case Processing verification passed: ${caseRoutes.length} case routes scoped to persisted workspace ownership.`,
);
