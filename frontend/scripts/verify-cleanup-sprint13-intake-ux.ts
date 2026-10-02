import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.resolve(root, p), "utf8");

const intake = read("app/intake/page.tsx");
assert.ok(intake.includes('ApplicationShell module="INTAKE"'));
assert.ok(intake.includes("OperationalMetricStrip"));
assert.ok(intake.includes("Source Review & Extraction Workspace"));

const queue = read("components/intake/IntakeOperationalQueue.tsx");
for (const value of [
  "/api/safety/intake?limit=500",
  "DUPLICATE",
  "TRIAGE",
  "MEDICAL_REVIEW",
  "Server-side workflow authority",
  "duplicate-review",
  "/triage",
  "validityStatus",
  "seriousnessStatus",
  "dispositionStatus",
]) {
  assert.ok(queue.includes(value), `Intake operational queue missing ${value}`);
}
assert.ok(!queue.includes('method: "POST"'), "Oversight queues must not create a second mutation path.");

for (const page of [
  "app/intake/duplicate-check/page.tsx",
  "app/intake/triage/page.tsx",
  "app/intake/medical-review/page.tsx",
]) {
  const source = read(page);
  assert.ok(source.includes('ApplicationShell module="INTAKE"'), `${page} must use governed Intake shell.`);
  assert.ok(source.includes("IntakeOperationalQueue"), `${page} must use the live operational queue.`);
}

const mr = read("app/intake/medical-review/page.tsx");
assert.ok(mr.includes("Single governed decision path"));
assert.ok(mr.includes("not a second mutation path"));

console.log("Cleanup Sprint 13 Intake & Triage operational UX verification passed.");
