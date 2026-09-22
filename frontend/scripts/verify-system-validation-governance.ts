import assert from "node:assert/strict";

import {
  SYSTEM_VALIDATION_CONTROLS,
  automatedPackageStatus,
} from "../lib/validation/system-validation-governance";

const ids = SYSTEM_VALIDATION_CONTROLS.map((control) => control.id);
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.includes("VAL-E2E-001"));
assert.ok(ids.includes("VAL-IQ-001"));
assert.ok(ids.includes("VAL-OQ-001"));
assert.ok(ids.includes("VAL-PQ-001"));

assert.equal(
  automatedPackageStatus([
    { automated: true, status: "PASS" },
    { automated: false, status: "MANUAL_REQUIRED" },
  ]),
  "READY_FOR_QA_REVIEW",
);
assert.equal(
  automatedPackageStatus([
    { automated: true, status: "FAIL" },
    { automated: false, status: "MANUAL_REQUIRED" },
  ]),
  "BLOCKED",
);

console.log("Sprint 10 system validation governance verification passed.");
