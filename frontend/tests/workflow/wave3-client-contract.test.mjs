import test from "node:test";
import assert from "node:assert/strict";
import { allowedSignalTransitions, isSignalApprovalTransition, validAggregatePeriod } from "../../lib/nexus/wave3-client-contract.ts";

test("signal transition UI mirrors the governed server state machine", () => {
  assert.deepEqual(allowedSignalTransitions("DETECTED"), ["VALIDATED", "REFUTED"]);
  assert.deepEqual(allowedSignalTransitions("VALIDATED"), ["UNDER_EVALUATION", "REFUTED"]);
  assert.deepEqual(allowedSignalTransitions("UNDER_EVALUATION"), ["CONFIRMED", "REFUTED"]);
  assert.deepEqual(allowedSignalTransitions("CONFIRMED"), ["CLOSED"]);
  assert.deepEqual(allowedSignalTransitions("REFUTED"), ["CLOSED"]);
  assert.deepEqual(allowedSignalTransitions("CLOSED"), []);
  assert.deepEqual(allowedSignalTransitions("NOT_A_SIGNAL_STATUS"), []);
});

test("human approval transitions require the separate signal approval permission", () => {
  assert.equal(isSignalApprovalTransition("CONFIRMED"), true);
  assert.equal(isSignalApprovalTransition("CLOSED"), true);
  assert.equal(isSignalApprovalTransition("VALIDATED"), false);
});

test("aggregate reporting period validation rejects impossible and reversed dates", () => {
  assert.equal(validAggregatePeriod("2026-01-01", "2026-06-30"), true);
  assert.equal(validAggregatePeriod("2026-06-30", "2026-01-01"), false);
  assert.equal(validAggregatePeriod("2026-02-30", "2026-03-01"), false);
  assert.equal(validAggregatePeriod("", "2026-03-01"), false);
});
