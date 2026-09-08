import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ocrService } from "../lib/literature/document-processing/ocr-service";
import { evidenceNormalizationService } from "../lib/literature/evidence-normalization/evidence-normalization-service";
import { medicalTranslationService } from "../lib/literature/translation/medical-translation-service";
import { knowledgeExtractionService } from "../lib/knowledge/extraction/knowledge-extraction-service";
import { knowledgeGraphService } from "../lib/knowledge/graph/knowledge-graph-service";
import { embeddingEngine } from "../lib/platform/ai/embeddings/embedding-engine";
import { vectorStore as platformVectorStore } from "../lib/platform/vector/vector-store";
import { assertLegacyVectorRuntimeAllowed } from "../lib/vector/legacy-vector-policy";

async function main() {
process.env.ALLOW_LEGACY_IN_MEMORY_VECTOR = "true";
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

await embeddingEngine.embed({ tenantId: tenantA, text: "Tenant A embedding" });
await embeddingEngine.embed({ tenantId: tenantB, text: "Tenant B embedding" });
assert.equal(embeddingEngine.listHistory(tenantA).length, 1);
assert.equal(embeddingEngine.listHistory(tenantB).length, 1);
assert.equal(embeddingEngine.getStatus(tenantA).totalEmbeddings, 1);
assert.equal(embeddingEngine.getStatus(tenantB).totalEmbeddings, 1);

platformVectorStore.upsert({
  id: "vector-a",
  vector: [1, 0],
  metadata: {
    tenantId: tenantA,
    documentId: "doc-a",
    chunkId: "chunk-a",
  },
  createdAt: new Date().toISOString(),
});
platformVectorStore.upsert({
  id: "vector-b",
  vector: [0, 1],
  metadata: {
    tenantId: tenantB,
    documentId: "doc-b",
    chunkId: "chunk-b",
  },
  createdAt: new Date().toISOString(),
});
assert.deepEqual(
  platformVectorStore.search({ tenantId: tenantA, queryVector: [1, 0] })
    .map((item) => item.id),
  ["vector-a"],
);
assert.deepEqual(
  platformVectorStore.search({ tenantId: tenantB, queryVector: [0, 1] })
    .map((item) => item.id),
  ["vector-b"],
);
assert.equal(platformVectorStore.getStatus(tenantA).totalVectors, 1);
assert.equal(platformVectorStore.getStatus(tenantB).totalVectors, 1);

assert.throws(
  () => assertLegacyVectorRuntimeAllowed("production"),
  /legacy in-memory vector/i,
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
  "app/api/platform/ai/embeddings/route.ts",
  "app/api/platform/ai/gateway/route.ts",
  "app/api/platform/ai/vector/route.ts",
  "app/api/vector/search/route.ts",
  "app/api/platform/rag/route.ts",
  "app/api/rbac/check/route.ts",
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

for (const route of [
  "app/api/vector/search/route.ts",
  "app/api/platform/rag/route.ts",
  "app/api/platform/ai/vector/route.ts",
]) {
  const source = await readFile(route, "utf8");
  assert.doesNotMatch(source, /lib\/(platform\/)?vector\/vector-store/,
    `${route} must not use a process-memory vector store`);
}

console.log(
  "Cross-tenant qualification passed: service histories are isolated and protected routes force authenticated tenant identity.",
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
