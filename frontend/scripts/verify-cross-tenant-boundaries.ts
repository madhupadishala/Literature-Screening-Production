import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ocrService } from "../lib/literature/document-processing/ocr-service";
import { evidenceNormalizationService } from "../lib/literature/evidence-normalization/evidence-normalization-service";
import { medicalTranslationService } from "../lib/literature/translation/medical-translation-service";

async function main() {
const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";

await ocrService.process({ tenantId: tenantA, pmid: "1001", fileName: "a.pdf" });
await ocrService.process({ tenantId: tenantB, pmid: "2002", fileName: "b.pdf" });
assert.deepEqual(ocrService.list(tenantA).map((item) => item.pmid), ["1001"]);
assert.deepEqual(ocrService.list(tenantB).map((item) => item.pmid), ["2002"]);
assert.equal(ocrService.getStatus(tenantA).processedDocuments, 1);
assert.equal(ocrService.getStatus(tenantB).processedDocuments, 1);

evidenceNormalizationService.normalize({
  tenantId: tenantA,
  sourceId: "source-a",
  sourceType: "abstract",
  content: "Tenant A evidence",
});
evidenceNormalizationService.normalize({
  tenantId: tenantB,
  sourceId: "source-b",
  sourceType: "abstract",
  content: "Tenant B evidence",
});
assert.deepEqual(
  evidenceNormalizationService.list(tenantA).map((item) => item.package.sourceId),
  ["source-a"],
);
assert.deepEqual(
  evidenceNormalizationService.list(tenantB).map((item) => item.package.sourceId),
  ["source-b"],
);

medicalTranslationService.translate({
  tenantId: tenantA,
  sourceText: "Tenant A safety text",
  sourceLanguage: "en",
});
medicalTranslationService.translate({
  tenantId: tenantB,
  sourceText: "Tenant B safety text",
  sourceLanguage: "en",
});
assert.deepEqual(
  medicalTranslationService.list(tenantA).map((item) => item.originalText),
  ["Tenant A safety text"],
);
assert.deepEqual(
  medicalTranslationService.list(tenantB).map((item) => item.originalText),
  ["Tenant B safety text"],
);

const guardedRoutes = [
  "app/api/literature/article-fetch/route.ts",
  "app/api/literature/document-processing/route.ts",
  "app/api/literature/evidence-normalization/route.ts",
  "app/api/literature/search-strategy/route.ts",
  "app/api/literature/translation/route.ts",
  "app/api/literature/workflow/route.ts",
];

for (const route of guardedRoutes) {
  const source = await readFile(route, "utf8");
  assert.match(source, /requirePermission\s*\(/, `${route} must authorize requests`);
  assert.match(
    source,
    /tenantId:\s*principal\.tenantId/,
    `${route} must override request tenant identity`,
  );
}

console.log(
  "Cross-tenant qualification passed: service histories are isolated and protected routes force authenticated tenant identity.",
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
