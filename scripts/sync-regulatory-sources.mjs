import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve("knowledge/Regulatory/EMA/GVP/source-manifest.json");
const outputDir = path.resolve("knowledge/Regulatory/EMA/GVP/source");
const resultPath = path.resolve("knowledge/Regulatory/EMA/GVP/acquisition-result.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(outputDir, { recursive: true });

const results = [];

for (const source of manifest.sources) {
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: { "user-agent": "PV-Knowledge-Source-Acquirer/1.0" }
  });
  if (!response.ok) {
    throw new Error(`${source.id}: HTTP ${response.status} while downloading ${source.url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${source.id}: downloaded payload is not a PDF`);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const localPath = path.join(outputDir, source.localFile);
  await writeFile(localPath, bytes);

  results.push({
    id: source.id,
    title: source.title,
    referenceNumber: source.referenceNumber,
    legalEffectiveDate: source.legalEffectiveDate,
    canonicalUrl: source.url,
    localPath: path.relative(process.cwd(), localPath).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256,
    acquiredFromAuthority: manifest.authority
  });
}

await writeFile(
  resultPath,
  JSON.stringify({
    schemaVersion: "1.0",
    acquisitionStatus: "ACQUIRED_NOT_YET_QA_APPROVED",
    authority: manifest.authority,
    sourceFamily: manifest.sourceFamily,
    sourceCount: results.length,
    results
  }, null, 2) + "\n",
  "utf8"
);

console.log(`Acquired and hashed ${results.length} authoritative GVP PDFs.`);
