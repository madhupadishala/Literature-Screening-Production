import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

type CatalogSource = {
  id?: unknown;
  authority?: unknown;
  jurisdiction?: unknown;
  title?: unknown;
  canonicalUrl?: unknown;
  status?: unknown;
  scope?: unknown;
  ingestionStatus?: unknown;
  publicationDate?: unknown;
  effectiveDate?: unknown;
  version?: unknown;
  checksumSha256?: unknown;
  approvalStatus?: unknown;
};

type Catalog = {
  schemaVersion?: unknown;
  purpose?: unknown;
  rules?: Record<string, unknown>;
  sources?: CatalogSource[];
};

const catalogPath = path.resolve(
  process.cwd(),
  "..",
  "knowledge",
  "Regulatory",
  "regulatory-source-catalog.json",
);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;

assert.equal(catalog.schemaVersion, "1.0");
assert.equal(catalog.rules?.authoritativeOnly, true);
assert.equal(catalog.rules?.fullTextInGit, false);
assert.equal(catalog.rules?.requireChecksumOnAcquisition, true);
assert.equal(catalog.rules?.requireHumanApprovalBeforeProductionRetrieval, true);
assert.equal(catalog.rules?.preserveSupersededVersions, true);
assert.ok(Array.isArray(catalog.sources) && catalog.sources.length > 0);

const ids = new Set<string>();
const authorities = new Set<string>();
const allowedIngestionStates = new Set([
  "CATALOGUED",
  "ACQUIRED",
  "PARSED",
  "CHUNKED",
  "INDEXED",
  "APPROVED",
  "SUPERSEDED",
  "REJECTED",
]);

for (const source of catalog.sources ?? []) {
  assert.equal(typeof source.id, "string");
  assert.ok((source.id as string).trim().length > 0);
  assert.ok(!ids.has(source.id as string), `Duplicate regulatory source id: ${source.id}`);
  ids.add(source.id as string);

  assert.equal(typeof source.authority, "string");
  assert.equal(typeof source.jurisdiction, "string");
  assert.equal(typeof source.title, "string");
  assert.equal(typeof source.canonicalUrl, "string");
  assert.ok((source.canonicalUrl as string).startsWith("https://"));
  assert.equal(typeof source.status, "string");
  assert.ok(Array.isArray(source.scope) && source.scope.length > 0);
  assert.equal(typeof source.ingestionStatus, "string");
  assert.ok(
    allowedIngestionStates.has(source.ingestionStatus as string),
    `Unsupported ingestion status for ${source.id}`,
  );

  authorities.add(source.authority as string);

  if (source.ingestionStatus !== "CATALOGUED") {
    assert.equal(
      typeof source.checksumSha256,
      "string",
      `Acquired/processed source ${source.id} requires checksumSha256`,
    );
    assert.match(
      source.checksumSha256 as string,
      /^[a-f0-9]{64}$/u,
      `Source ${source.id} checksum must be SHA-256`,
    );
  }

  if (source.ingestionStatus === "APPROVED") {
    assert.equal(
      source.approvalStatus,
      "APPROVED",
      `Production source ${source.id} must have explicit approvalStatus`,
    );
    assert.ok(
      typeof source.version === "string" || typeof source.effectiveDate === "string",
      `Approved source ${source.id} requires version or effectiveDate`,
    );
  }
}

for (const requiredAuthority of [
  "EMA",
  "ICH",
  "CDSCO",
  "IPC",
  "FDA",
  "MHRA",
  "HEALTH_CANADA",
  "TGA",
  "PMDA",
  "WHO",
]) {
  assert.ok(
    authorities.has(requiredAuthority),
    `Required authority missing from controlled catalog: ${requiredAuthority}`,
  );
}

const productionEligible = (catalog.sources ?? []).filter(
  (source) => source.ingestionStatus === "APPROVED",
);
for (const source of productionEligible) {
  assert.equal(source.approvalStatus, "APPROVED");
}

console.log(
  `Regulatory knowledge foundation verification passed: ${catalog.sources?.length ?? 0} controlled source families; ${productionEligible.length} production-approved sources.`,
);
