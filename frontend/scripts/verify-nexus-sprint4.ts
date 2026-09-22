import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { extractDocumentText } from "../lib/safety/intake/document-text-extractor";
import { extractPvSuggestions } from "../lib/safety/intake/pv-suggestion-extractor";

async function main() {
const migration = readFileSync(
  path.join(
    process.cwd(),
    "database/migrations/025_nexus_intake_review_extraction.sql",
  ),
  "utf8",
);

assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_extraction_runs").length - 1,
  1,
);
assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_extraction_suggestions").length - 1,
  1,
);
assert.equal(migration.includes("source_review_status"), true);
assert.equal(migration.includes("'SUPERSEDED'"), true);
assert.equal(migration.includes("extracted_text_sha256"), true);

const textResult = await extractDocumentText({
  bytes: Buffer.from(
    "45-year-old female. Reporter: physician. Suspect drug: Example Drug. Adverse event: Headache.",
    "utf8",
  ),
  contentType: "text/plain",
});
assert.equal(textResult.textSha256.length, 64);
assert.equal(textResult.text.includes("Example Drug"), true);

const suggestions = extractPvSuggestions(textResult.text);
assert.equal(suggestions.some((item) => item.suggestionType === "PATIENT"), true);
assert.equal(suggestions.some((item) => item.suggestionType === "REPORTER"), true);
assert.equal(suggestions.some((item) => item.suggestionType === "PRODUCT"), true);
assert.equal(suggestions.some((item) => item.suggestionType === "EVENT"), true);
assert.equal(
  suggestions.every(
    (item) =>
      item.confidence >= 0 &&
      item.confidence <= 1 &&
      item.evidenceText.length > 0,
  ),
  true,
);

const noFalseReporter = extractPvSuggestions(
  "A 61-year-old patient developed dizziness after treatment.",
);
assert.equal(
  noFalseReporter.some((item) => item.suggestionType === "REPORTER"),
  false,
);

for (const route of [
  "app/api/safety/intake/[intakeId]/route.ts",
  "app/api/safety/intake/[intakeId]/extraction/route.ts",
  "app/api/safety/intake/[intakeId]/suggestions/[suggestionId]/route.ts",
  "app/api/safety/intake/[intakeId]/source-review/route.ts",
  "app/api/safety/intake/[intakeId]/documents/[documentId]/route.ts",
]) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("NEXUS_MODULES.INTAKE"), true, route);
  assert.equal(source.includes("requireModulePermission"), true, route);
}

const reviewService = readFileSync(
  path.join(
    process.cwd(),
    "lib/safety/intake/intake-review-service.ts",
  ),
  "utf8",
);
assert.equal(reviewService.includes("INTAKE_EXTRACTION_COMPLETED"), true);
assert.equal(
  reviewService.includes("INTAKE_EXTRACTION_SUGGESTION_REVIEWED"),
  true,
);
assert.equal(reviewService.includes("INTAKE_SOURCE_REVIEW_VERIFIED"), true);
assert.equal(reviewService.includes("INTAKE_EXTRACTION_FAILED"), true);
assert.equal(reviewService.includes("FOR UPDATE OF intake"), true);
assert.equal(
  reviewService.includes("UPDATE safety_review_tasks"),
  false,
  "Sprint 4 must not complete Sprint 5 formal TRIAGE tasks.",
);
assert.equal(
  reviewService.includes("All current extraction suggestions must be accepted"),
  true,
);

const page = readFileSync(
  path.join(process.cwd(), "app/intake/page.tsx"),
  "utf8",
);
assert.equal(page.includes("Source Review & Extraction Workspace"), true);
assert.equal(page.includes("Open original source"), true);
assert.equal(page.includes("Accept edited"), true);
assert.equal(page.includes("Verify source review"), true);

const extractorSource = readFileSync(
  path.join(process.cwd(), "lib/safety/intake/pv-suggestion-extractor.ts"),
  "utf8",
);
assert.equal(extractorSource.includes("openai"), false);
assert.equal(extractorSource.includes("anthropic"), false);

console.log("Nexus Sprint 4 intake review and extraction verification passed.");
}

void main();
