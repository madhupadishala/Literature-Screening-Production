import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.resolve(process.cwd(), "app/cases/[caseId]/case-workspace-client.tsx"), "utf8");

for (const value of [
  "ApplicationShell",
  "OperationalScreenHeader",
  "OperationalMetricStrip",
  "OperationalState",
  '"General"',
  '"Patient"',
  '"Products"',
  '"Events"',
  '"Safety Assessment"',
  '"Narrative"',
  '"Action Items"',
  '"Additional Information"',
  '"Evidence & Export"',
  '"Audit & Versions"',
  '"CAUSALITY"',
  '"EXPECTEDNESS"',
  '"LISTEDNESS"',
  '"SERIOUSNESS_SUPPORT"',
  "Record human assessment",
  "Human-governed case processing",
  "Immutable finalized case",
]) {
  assert.ok(source.includes(value), `Case Processing operational UX missing ${value}`);
}

assert.ok(!source.includes('import Navigation from "@/components/Navigation"'), "Case workspace must not mount primary navigation directly.");
assert.ok(!/["']Other["']/.test(source), 'Uncontrolled "Other" tab is not permitted.');

console.log("Cleanup Sprint 14 Case Processing operational UX verification passed.");
