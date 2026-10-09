import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const labelRoot = path.resolve(process.cwd(), "..", "knowledge", "Labeling");
const indexPath = path.join(labelRoot, "label-inventory-index.json");

function walk(dir: string, fileName: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, fileName, out);
    else if (entry.isFile() && entry.name === fileName) out.push(full);
  }
  return out;
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

if (!fs.existsSync(indexPath)) {
  throw new Error(`Label inventory index missing: ${indexPath}`);
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
  manifestCount: number;
  authorizationRecordCount: number;
  integrity: Record<string, number>;
  governance: Record<string, unknown>;
};

const manifests = walk(labelRoot, "manifest.json").sort();
const authorizations = walk(labelRoot, "authorization.json").sort();
const failures: string[] = [];

let sourceFilesPresent = 0;
let hashMatches = 0;
let parsedTextPresent = 0;
let qaFilesPresent = 0;
let sourceBytesUnmodified = 0;
let textPreservedWithoutTruncation = 0;
let humanContentReviewPending = 0;
let draftCount = 0;
let productionEligibleCount = 0;
let productionBlockedCount = 0;
let effectiveDatesKnown = 0;

for (const manifestPath of manifests) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as any;
  const sourcePath = path.resolve(process.cwd(), "..", String(manifest.source?.path || ""));
  const parsedPath = path.resolve(
    process.cwd(),
    "..",
    String(manifest.derived?.parsedPath || ""),
    "document.txt",
  );
  const qaPath = path.join(path.dirname(manifestPath), "qa", "acquisition-check.json");

  if (fs.existsSync(sourcePath)) {
    sourceFilesPresent += 1;
    if (sha256(sourcePath) === manifest.source?.sha256) hashMatches += 1;
    else failures.push(`${manifest.labelId}: source SHA-256 mismatch`);
  } else {
    failures.push(`${manifest.labelId}: source file missing`);
  }

  if (fs.existsSync(parsedPath)) parsedTextPresent += 1;
  else failures.push(`${manifest.labelId}: parsed document.txt missing`);

  if (fs.existsSync(qaPath)) {
    qaFilesPresent += 1;
    const qa = JSON.parse(fs.readFileSync(qaPath, "utf8")) as any;
    if (qa.sourceBytesUnmodified === true) sourceBytesUnmodified += 1;
    if (qa.textPreservedWithoutTruncation === true) textPreservedWithoutTruncation += 1;
    if (qa.humanContentReview === "PENDING") humanContentReviewPending += 1;
  } else {
    failures.push(`${manifest.labelId}: acquisition QA record missing`);
  }

  if (manifest.governanceStatus === "DRAFT") draftCount += 1;
  if (manifest.effectiveForProduction === true) productionEligibleCount += 1;
  if (manifest.referenceMapping?.productionUseBlocked === true) productionBlockedCount += 1;
  if (manifest.effectiveDate) effectiveDatesKnown += 1;
}

const expectedChecks: Array<[string, number, number]> = [
  ["manifest count", manifests.length, Number(index.manifestCount)],
  ["authorization record count", authorizations.length, Number(index.authorizationRecordCount)],
  ["source files present", sourceFilesPresent, Number(index.integrity.sourceFilesPresent)],
  ["SHA-256 matches", hashMatches, Number(index.integrity.sha256Matches)],
  ["parsed text present", parsedTextPresent, Number(index.integrity.parsedTextPresent)],
  ["QA files present", qaFilesPresent, Number(index.integrity.qaFilesPresent)],
  ["source bytes unmodified", sourceBytesUnmodified, Number(index.integrity.sourceBytesUnmodified)],
  ["text preserved without truncation", textPreservedWithoutTruncation, Number(index.integrity.textPreservedWithoutTruncation)],
  ["human content review pending", humanContentReviewPending, Number(index.integrity.humanContentReviewPending)],
];

for (const [name, actual, expected] of expectedChecks) {
  if (actual !== expected) failures.push(`${name}: expected ${expected}, found ${actual}`);
}

if (productionEligibleCount !== Number(index.governance.productionEligible)) {
  failures.push(
    `production eligible count: expected ${index.governance.productionEligible}, found ${productionEligibleCount}`,
  );
}
if (productionBlockedCount !== Number(index.governance.productionBlocked)) {
  failures.push(
    `production blocked count: expected ${index.governance.productionBlocked}, found ${productionBlockedCount}`,
  );
}
if (effectiveDatesKnown !== Number(index.governance.effectiveDatesKnown)) {
  failures.push(
    `effective dates known: expected ${index.governance.effectiveDatesKnown}, found ${effectiveDatesKnown}`,
  );
}

console.log(
  JSON.stringify(
    {
      manifestCount: manifests.length,
      authorizationRecordCount: authorizations.length,
      sourceFilesPresent,
      hashMatches,
      parsedTextPresent,
      qaFilesPresent,
      sourceBytesUnmodified,
      textPreservedWithoutTruncation,
      humanContentReviewPending,
      draftCount,
      productionEligibleCount,
      productionBlockedCount,
      effectiveDatesKnown,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exit(1);

console.log("Step 1 label inventory verification passed.");
