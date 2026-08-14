import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ocrService } from "../lib/literature/document-processing/ocr-service";
import { evidenceNormalizationService } from "../lib/literature/evidence-normalization/evidence-normalization-service";
import { medicalTranslationService } from "../lib/literature/translation/medical-translation-service";
import { knowledgeExtractionService } from "../lib/knowledge/extraction/knowledge-extraction-service";
import { knowledgeGraphService } from "../lib/knowledge/graph/knowledge-graph-service";
import { knowledgeGovernanceService } from "../lib/knowledge/governance/knowledge-governance-service";
import { knowledgeStore } from "../lib/knowledge/repository/knowledge-store";

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


knowledgeStore.create({
  tenantId: tenantA,
  title: "Tenant A SOP",
  category: "sop",
  version: "1.0",
  content: "A",
});
knowledgeStore.create({
  tenantId: tenantB,
  title: "Tenant B SOP",
  category: "sop",
  version: "1.0",
  content: "B",
});
assert.deepEqual(knowledgeStore.list(tenantA).map((item) => item.title), ["Tenant A SOP"]);
assert.deepEqual(knowledgeStore.list(tenantB).map((item) => item.title), ["Tenant B SOP"]);

knowledgeExtractionService.extract({
  tenantId: tenantA,
  documentId: "doc-a",
  title: "A",
  content: "A",
});
knowledgeExtractionService.extract({
  tenantId: tenantB,
  documentId: "doc-b",
  title: "B",
  content: "B",
});
assert.deepEqual(
  knowledgeExtractionService.list(tenantA).map((item) => item.documentId),
  ["doc-a"],
);
assert.deepEqual(
  knowledgeExtractionService.list(tenantB).map((item) => item.documentId),
  ["doc-b"],
);

knowledgeGraphService.build({ tenantId: tenantA, documentId: "doc-a", nodes: [] });
knowledgeGraphService.build({ tenantId: tenantB, documentId: "doc-b", nodes: [] });
assert.deepEqual(knowledgeGraphService.list(tenantA).map((item) => item.documentId), ["doc-a"]);
assert.deepEqual(knowledgeGraphService.list(tenantB).map((item) => item.documentId), ["doc-b"]);

const governanceA = knowledgeGovernanceService.createRecord({
  tenantId: tenantA,
  knowledgeDocumentId: "doc-a",
  version: "1.0",
});
const governanceB = knowledgeGovernanceService.createRecord({
  tenantId: tenantB,
  knowledgeDocumentId: "doc-b",
  version: "1.0",
});
knowledgeGovernanceService.applyAction({
  tenantId: tenantA,
  governanceRecordId: governanceA.id,
  action: "submit_for_review",
  actor: "Tenant A Reviewer",
});
assert.throws(
  () =>
    knowledgeGovernanceService.applyAction({
      tenantId: tenantB,
      governanceRecordId: governanceA.id,
      action: "approve",
      actor: "Tenant B Reviewer",
    }),
  /not found/i,
);
assert.deepEqual(
  knowledgeGovernanceService.listRecords(tenantA).map((item) => item.id),
  [governanceA.id],
);
assert.deepEqual(
  knowledgeGovernanceService.listRecords(tenantB).map((item) => item.id),
  [governanceB.id],
);

const guardedRoutes = [
  "app/api/literature/article-fetch/route.ts",
  "app/api/literature/document-processing/route.ts",
  "app/api/literature/evidence-normalization/route.ts",
  "app/api/literature/search-strategy/route.ts",
  "app/api/literature/translation/route.ts",
  "app/api/literature/workflow/route.ts",
  "app/api/knowledge/repository/route.ts",
  "app/api/knowledge/extraction/route.ts",
  "app/api/knowledge/graph/route.ts",
  "app/api/knowledge/governance/route.ts",
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
