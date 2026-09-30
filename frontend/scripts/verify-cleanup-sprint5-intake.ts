import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

const intakeRoutes = [
  "app/api/safety/intake/route.ts",
  "app/api/safety/intake/manual/route.ts",
  "app/api/safety/intake/external/route.ts",
  "app/api/safety/intake/document/route.ts",
  "app/api/safety/intake/literature/route.ts",
  "app/api/safety/intake/[intakeId]/route.ts",
  "app/api/safety/intake/[intakeId]/triage/route.ts",
  "app/api/safety/intake/[intakeId]/disposition/route.ts",
  "app/api/safety/intake/[intakeId]/source-review/route.ts",
  "app/api/safety/intake/[intakeId]/extraction/route.ts",
  "app/api/safety/intake/[intakeId]/duplicate-review/route.ts",
  "app/api/safety/intake/[intakeId]/duplicate-review/finalize/route.ts",
  "app/api/safety/intake/[intakeId]/suggestions/[suggestionId]/route.ts",
  "app/api/safety/intake/[intakeId]/documents/[documentId]/route.ts",
  "app/api/safety/intake/[intakeId]/handoffs/[packageId]/route.ts",
];

for (const route of intakeRoutes) {
  const source = read(route);
  assert.ok(
    source.includes("requireWorkspaceModulePermission"),
    `${route} must use the canonical workspace/module guard`,
  );
  assert.ok(
    source.includes("NEXUS_MODULES.INTAKE"),
    `${route} must authorize the Intake module explicitly`,
  );
  assert.equal(
    /\brequireModulePermission\s*\(/u.test(source),
    false,
    `${route} still calls the legacy module guard`,
  );
  assert.equal(
    /\brequirePermission\s*\(/u.test(source),
    false,
    `${route} still calls the legacy permission guard`,
  );
}

const disposition = read(
  "app/api/safety/intake/[intakeId]/disposition/route.ts",
);
assert.ok(
  disposition.includes(
    "requireAdditionalModulePermissionInSelectedWorkspace",
  ),
  "Case-creation disposition must separately authorize the downstream module in the selected workspace.",
);
assert.ok(disposition.includes("NEXUS_MODULES.CASE_PROCESSING"));
assert.ok(disposition.includes("PERMISSIONS.CASE_CREATE"));
assert.ok(disposition.includes("PERMISSIONS.INTAKE_EXPORT"));

const workspaceGuard = read("lib/rbac/workspace-guard.ts");
assert.ok(
  workspaceGuard.includes(
    "requireAdditionalModulePermissionInSelectedWorkspace",
  ),
);
assert.ok(
  workspaceGuard.includes("requireContextModuleMatch"),
  "Cross-module helper must reuse signed selected workspace scope rather than accept arbitrary selectors.",
);

const documentRoute = read(
  "app/api/safety/intake/[intakeId]/documents/[documentId]/route.ts",
);
assert.ok(
  documentRoute.includes("principal.tenantId"),
  "Document lookup must be tenant-bound.",
);

for (const doc of [
  "../docs/benchmarks/BENCHMARK_INTAKE_TRIAGE.md",
  "../docs/requirements/URS/URS_INTAKE_TRIAGE.md",
  "../docs/requirements/FRS/FRS_INTAKE_TRIAGE.md",
  "../docs/user-guides/USER_GUIDE_INTAKE_TRIAGE.md",
]) {
  assert.ok(
    read(doc).length > 500,
    `Controlled Sprint 5 document is missing/incomplete: ${doc}`,
  );
}

console.log(
  `Sprint 5 Intake reconciliation verification passed: ${intakeRoutes.length} workspace-scoped Intake routes plus same-workspace Case Processing handoff authorization.`,
);
