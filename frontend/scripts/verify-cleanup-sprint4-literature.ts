import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

function interfaceDeclaration(source: string, name: string): string {
  const marker = `interface ${name}`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Missing interface declaration: ${name}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `Missing opening brace for interface: ${name}`);

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(markerIndex, index + 1);
    }
  }

  assert.fail(`Missing closing brace for interface: ${name}`);
}

const literatureRoutes = [
  "app/api/literature/adhoc-search/evidence/route.ts",
  "app/api/literature/adhoc-search/route.ts",
  "app/api/literature/article-fetch/route.ts",
  "app/api/literature/document-processing/route.ts",
  "app/api/literature/duplicates/route.ts",
  "app/api/literature/evidence-normalization/route.ts",
  "app/api/literature/global-sources/route.ts",
  "app/api/literature/hits/retry/route.ts",
  "app/api/literature/hits/review/route.ts",
  "app/api/literature/hits/route.ts",
  "app/api/literature/intake-input/[exportId]/route.ts",
  "app/api/literature/intake-input/route.ts",
  "app/api/literature/pubmed/search/route.ts",
  "app/api/literature/review/causality/route.ts",
  "app/api/literature/review/labeling/route.ts",
  "app/api/literature/review/medical/route.ts",
  "app/api/literature/review/patient-extraction/route.ts",
  "app/api/literature/review/patient-segmentation/route.ts",
  "app/api/literature/review/route.ts",
  "app/api/literature/screening/route.ts",
  "app/api/literature/search-strategy/route.ts",
  "app/api/literature/translation/route.ts",
  "app/api/literature/workflow/route.ts",
  "app/api/workflow/run/route.ts",
];

for (const route of literatureRoutes) {
  const source = read(route);
  assert.ok(
    source.includes("requireWorkspaceModulePermission"),
    `${route} must use the canonical workspace/module guard`,
  );
  assert.ok(
    source.includes("NEXUS_MODULES.LITERATURE"),
    `${route} must authorize the Literature module explicitly`,
  );
  assert.equal(
    /\brequirePermission\s*\(/u.test(source),
    false,
    `${route} still calls the legacy tenant permission guard`,
  );
  assert.equal(
    /\brequireModulePermission\s*\(/u.test(source),
    false,
    `${route} still calls the legacy module guard`,
  );
}

for (const route of [
  "app/api/literature/article-fetch/route.ts",
  "app/api/literature/document-processing/route.ts",
  "app/api/literature/evidence-normalization/route.ts",
  "app/api/literature/global-sources/route.ts",
  "app/api/literature/pubmed/search/route.ts",
  "app/api/literature/search-strategy/route.ts",
  "app/api/literature/translation/route.ts",
  "app/api/literature/workflow/route.ts",
]) {
  const source = read(route);
  assert.ok(
    source.includes("assertRequestedTenantMatchesScope"),
    `${route} must reject legacy tenant selectors that disagree with scoped context`,
  );
  assert.equal(
    /tenantId:\s*body\.tenantId/u.test(source),
    false,
    `${route} must not pass request tenantId as authority`,
  );
  assert.equal(
    /tenantId:\s*"demo-tenant"/u.test(source),
    false,
    `${route} must not use demo tenant authority`,
  );
}

const tenantScopedServices = [
  "lib/literature/article-fetch/article-fetch-service.ts",
  "lib/literature/document-processing/ocr-service.ts",
  "lib/literature/evidence-normalization/evidence-normalization-service.ts",
  "lib/literature/pubmed/pubmed-service.ts",
  "lib/literature/search/search-strategy-engine.ts",
  "lib/literature/translation/medical-translation-service.ts",
  "lib/literature/workflow/literature-workflow-service.ts",
];

for (const service of tenantScopedServices) {
  const source = read(service);
  assert.ok(
    source.includes("listForTenant"),
    `${service} must expose tenant-filtered history listing`,
  );
}

for (const [typeFile, marker] of [
  ["lib/literature/document-processing/document-processing-types.ts", "PDFProcessingResult"],
  ["lib/literature/search/search-strategy-types.ts", "SearchStrategyResult"],
  ["lib/literature/translation/translation-types.ts", "MedicalTranslationResult"],
] as const) {
  const source = read(typeFile);
  const declaration = interfaceDeclaration(source, marker);
  assert.ok(
    /\btenantId\s*:\s*string\b/u.test(declaration),
    `${marker} must retain tenant ownership`,
  );
}

const workspaceGuard = read("lib/rbac/workspace-guard.ts");
assert.ok(workspaceGuard.includes("access.effectivePermissions"));
assert.ok(workspaceGuard.includes("hasPermission: (candidatePermission)"));

const accessService = read("lib/nexus/workspace-access-service.ts");
assert.ok(accessService.includes("effectivePermissions: Permission[]"));
assert.ok(accessService.includes("effectivePermissions.includes(input.permission)"));

const screeningRoute = read("app/api/literature/screening/route.ts");
for (const permission of [
  "PERMISSIONS.SEARCH_HISTORY_VIEW",
  "PERMISSIONS.SCREENING_EXECUTE",
  "PERMISSIONS.SCREENING_REVIEW",
]) {
  assert.ok(screeningRoute.includes(permission), `Screening route missing ${permission}`);
}

for (const doc of [
  "../docs/benchmarks/BENCHMARK_LITERATURE_SCREENING.md",
  "../docs/requirements/URS/URS_LITERATURE_SCREENING.md",
  "../docs/requirements/FRS/FRS_LITERATURE_SCREENING.md",
  "../docs/user-guides/USER_GUIDE_LITERATURE_SCREENING.md",
]) {
  assert.ok(read(doc).length > 500, `Controlled Sprint 4 document is missing/incomplete: ${doc}`);
}

// Sprint 3.3: finalized Medical Review is locked under the tenant-scoped row transaction.
const medicalReviewMutations = read("lib/literature/review/review-mutation-service.ts");
const medicalReviewSave = medicalReviewMutations.slice(
  medicalReviewMutations.indexOf("export async function saveMedicalReview("),
);
assert.ok(
  medicalReviewSave.includes('workspace.status === "REVIEW_COMPLETE"'),
  "Medical Review must reject silent mutation of finalized workspace",
);
assert.ok(
  medicalReviewSave.indexOf('workspace.status === "REVIEW_COMPLETE"') <
    medicalReviewSave.indexOf("INSERT INTO literature_medical_reviews"),
  "Finalized review guard must precede Medical Review persistence",
);
assert.ok(
  medicalReviewSave.includes('MEDICAL_REVIEW_SAVED'),
  "Medical Review decisions must preserve audit attribution",
);
const medicalReviewRoute = read("app/api/literature/review/medical/route.ts");
assert.ok(medicalReviewRoute.includes("PERMISSIONS.MEDICAL_REVIEW"));
const intakeRules = read("lib/literature/intake-input/intake-input-governance.ts");
assert.ok(intakeRules.includes('input.mrReviewStatus !== "APPROVED"'));

console.log(
  `Sprint 4 Literature reconciliation verification passed: ${literatureRoutes.length} workspace-scoped routes and tenant-bound transient histories.`,
);
