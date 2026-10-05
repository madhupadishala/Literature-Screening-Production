import { activeReviewReferenceData } from "../lib/literature/review/review-reference-service";
import { assessListednessFromKnowledgeBase } from "../lib/listedness-intelligence/knowledge-base-listedness-service";

const tenantId =
  process.env.LISTEDNESS_E2E_TENANT_ID?.trim() ||
  process.env.DEMO_TENANT_KEY?.trim() ||
  "demo-tenant";
const maxCases = Math.max(
  1,
  Math.min(Number(process.env.LISTEDNESS_E2E_MAX_CASES || 20), 100),
);

const references = (await activeReviewReferenceData(tenantId)).labelReferences
  .filter(
    (reference) =>
      reference.usageScope === "PRODUCTION" &&
      reference.clientProductId &&
      reference.country &&
      reference.sourceDocument &&
      reference.eventTerms.length > 0,
  )
  .sort((a, b) => a.labelKey.localeCompare(b.labelKey));

if (references.length === 0) {
  throw new Error(
    "No active PRODUCTION Label / RSI references with sourceDocument and eventTerms are available for the selected tenant.",
  );
}

const cases = references
  .flatMap((reference) =>
    reference.eventTerms.map((event) => ({ reference, event })),
  )
  .slice(0, maxCases);

const failures: Array<Record<string, unknown>> = [];
const passes: Array<Record<string, unknown>> = [];

for (const testCase of cases) {
  const result = await assessListednessFromKnowledgeBase({
    tenantId,
    clientProductId: testCase.reference.clientProductId,
    country: testCase.reference.country,
    reportedEvent: testCase.event,
    relevantDate: testCase.reference.effectiveFrom,
    requireDocumentEvidence: true,
    requestId: "listedness-real-label-e2e",
    correlationId: `listedness-e2e-${testCase.reference.labelKey}`,
  });

  const pass =
    result.reference?.labelKey === testCase.reference.labelKey &&
    result.reference?.version === testCase.reference.version &&
    result.retrieval.evidenceMode === "CONTROLLED_KNOWLEDGE_DOCUMENT" &&
    result.retrieval.matchedChunks > 0 &&
    result.retrieval.citationIds.length > 0 &&
    result.assessment.listedness === "LISTED";

  const record = {
    labelKey: testCase.reference.labelKey,
    labelType: testCase.reference.labelType,
    version: testCase.reference.version,
    productId: testCase.reference.clientProductId,
    country: testCase.reference.country,
    event: testCase.event,
    sourceDocument: testCase.reference.sourceDocument,
    listedness: result.assessment.listedness,
    reasonCode: result.assessment.reasonCode,
    evidenceMode: result.retrieval.evidenceMode,
    matchedChunks: result.retrieval.matchedChunks,
    citationCount: result.retrieval.citationIds.length,
  };

  if (pass) passes.push(record);
  else failures.push(record);
}

console.log(
  JSON.stringify(
    {
      tenantId,
      tested: cases.length,
      passed: passes.length,
      failed: failures.length,
      documents: [...new Set(cases.map((item) => item.reference.labelKey))].length,
      passSummary: passes,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exit(1);
}
