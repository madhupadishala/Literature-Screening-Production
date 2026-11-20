import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function source(relative) {
  const path = join(root, relative);
  assert.ok(existsSync(path), `Missing expected NEXUS route/contract: ${relative}`);
  return readFileSync(path, "utf8");
}

const nineRoutes = {
  literature: "app/literature/dashboard/page.tsx",
  intake: "app/intake/page.tsx",
  caseProcessing: "app/cases/page.tsx",
  submissions: "app/submissions/page.tsx",
  signals: "app/signals/page.tsx",
  aggregate: "app/aggregate-reports/page.tsx",
  documents: "app/pv-documents/page.tsx",
  micc: "app/micc/page.tsx",
  productMatrix: "app/product-matrix/page.tsx",
};

test("all nine named frontend entry routes exist (not a functional UAT assertion)", () => {
  for (const [name, path] of Object.entries(nineRoutes)) {
    assert.ok(source(path).includes("ApplicationShell"), `${name} missing canonical shell`);
  }
});

test("only seven backend-entitled modules are offered as navigable operational modules", () => {
  const registry = source("lib/nexus/ui-module-registry.ts");
  for (const name of ["LITERATURE","INTAKE","CASE_PROCESSING","SUBMISSIONS","SIGNAL_MANAGEMENT","AGGREGATE_REPORTING","PV_DOCUMENTATION"]) {
    assert.match(registry, new RegExp(name));
  }
  assert.doesNotMatch(registry, /\bMICC\s*:/);
  assert.doesNotMatch(registry, /\bPRODUCT_MATRIX\s*:/);
  assert.match(source("app/micc/page.tsx"), /No MICC module entitlement/);
  assert.match(source("app/product-matrix/page.tsx"), /no product × country × obligation status ledger/);
});

test("governed Signal, Aggregate and PV Document endpoints retain mandatory workspace/module guards", () => {
  for (const route of [
    "app/api/signals/route.ts",
    "app/api/signals/[signalId]/route.ts",
    "app/api/signals/[signalId]/assessments/route.ts",
    "app/api/aggregate-reports/route.ts",
    "app/api/aggregate-reports/[reportId]/route.ts",
    "app/api/aggregate-reports/[reportId]/versions/route.ts",
    "app/api/pv-documents/route.ts",
    "app/api/pv-documents/[documentId]/route.ts",
    "app/api/pv-documents/[documentId]/versions/route.ts",
  ]) {
    const code = source(route);
    assert.match(code, /requireWorkspaceModulePermission/, `${route} missing module scope enforcement`);
    assert.match(code, /PERMISSIONS\./, `${route} missing explicit RBAC permission`);
  }
});

test("regulated actions do not masquerade as enabled in unavailable module routes", () => {
  const micc = source("app/micc/page.tsx");
  const matrix = source("app/product-matrix/page.tsx");
  assert.doesNotMatch(micc, /fetch\(|<form|type="submit"/);
  assert.doesNotMatch(matrix, /\/api\/product-matrix|\/api\/obligations/);
  assert.match(source("app/submissions/SubmissionWorkspace.tsx"), /transmission is locked/i);
});
