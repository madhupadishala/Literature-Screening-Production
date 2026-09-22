import assert from "node:assert/strict";

import {
  classifyAiFailureRate,
  sha256Text,
  verifyStoredContentHash,
} from "../lib/enterprise/reliability-governance";

assert.deepEqual(classifyAiFailureRate({ executions: 4, failures: 4 }), {
  ratePercent: 100,
});
assert.deepEqual(classifyAiFailureRate({ executions: 10, failures: 2 }), {
  severity: "WARNING",
  ratePercent: 20,
});
assert.deepEqual(classifyAiFailureRate({ executions: 10, failures: 5 }), {
  severity: "CRITICAL",
  ratePercent: 50,
});
const content = JSON.stringify({ stable: true });
assert.equal(
  verifyStoredContentHash({
    content,
    expectedSha256: sha256Text(content),
  }),
  true,
);
assert.equal(
  verifyStoredContentHash({
    content,
    expectedSha256: sha256Text(content + "tampered"),
  }),
  false,
);

console.log("Sprint 9 reliability governance verification passed.");
