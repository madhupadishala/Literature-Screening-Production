import { validateConfigurationPayload } from "../lib/configuration/validation";
import {
  buildLabelReferenceCandidatePayload,
  listLabelReferenceCandidates,
} from "../lib/listedness-intelligence/label-reference-candidate-service";

const candidates = listLabelReferenceCandidates();
const payload = buildLabelReferenceCandidatePayload();
const validation = validateConfigurationPayload("LABEL_REFERENCE", payload);

const byProduct = new Map<string, number>();
const byCountry = new Map<string, number>();
const blockers = new Map<string, number>();

for (const candidate of candidates) {
  byProduct.set(candidate.clientProductId, (byProduct.get(candidate.clientProductId) || 0) + 1);
  byCountry.set(candidate.country, (byCountry.get(candidate.country) || 0) + 1);
  for (const blocker of candidate.blockers) {
    blockers.set(blocker, (blockers.get(blocker) || 0) + 1);
  }
}

const failures: string[] = [];

if (candidates.length !== 59) {
  failures.push(`Expected 59 label mapping candidates, found ${candidates.length}.`);
}
if (payload.candidateMetadata.productionReadyCount !== 0) {
  failures.push(
    `Expected zero production-ready candidates before medical/regulatory approval; found ${payload.candidateMetadata.productionReadyCount}.`,
  );
}
if (!validation.valid) {
  failures.push(
    ...validation.errors.map((error) => `${error.path}: ${error.message}`),
  );
}

console.log(
  JSON.stringify(
    {
      candidateCount: candidates.length,
      productionReadyCount: payload.candidateMetadata.productionReadyCount,
      blockedCount: payload.candidateMetadata.blockedCount,
      byProduct: Object.fromEntries([...byProduct.entries()].sort()),
      byCountry: Object.fromEntries([...byCountry.entries()].sort()),
      blockers: Object.fromEntries([...blockers.entries()].sort()),
      configurationValidation: validation,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exit(1);

console.log(
  "Step 2 label-reference candidate mapping verification passed; all candidates remain fail-closed for production.",
);
