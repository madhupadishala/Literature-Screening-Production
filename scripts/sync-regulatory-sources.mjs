import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = path.resolve("knowledge/Regulatory/EMA/GVP/source-manifest.json");
const outputRoot = path.resolve("knowledge/Regulatory/EMA/GVP");
const resultPath = path.resolve("knowledge/Regulatory/EMA/GVP/acquisition-result.json");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(outputRoot, { recursive: true });

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
  const localPath = path.join(outputRoot, source.localFile);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, bytes);

  const packageRoot = path.dirname(path.dirname(localPath));
  const packageManifest = {
    schemaVersion: "1.0",
    documentId: source.id,
    documentType: "REGULATORY_GUIDANCE",
    title: source.title,
    authority: manifest.authority,
    version: source.referenceNumber,
    effectiveDate: source.legalEffectiveDate,
    governanceStatus: "ACQUIRED",
    source: {
      path: path.relative(process.cwd(), localPath).replaceAll("\\\\", "/"),
      canonicalUrl: source.url,
      sha256,
      bytes: bytes.length,
      mimeType: "application/pdf"
    },
    derived: {
      parsedPath: path.relative(process.cwd(), path.join(packageRoot, "derived/parsed")).replaceAll("\\\\", "/"),
      chunksPath: path.relative(process.cwd(), path.join(packageRoot, "derived/chunks")).replaceAll("\\\\", "/"),
      embeddingsPath: path.relative(process.cwd(), path.join(packageRoot, "derived/embeddings")).replaceAll("\\\\", "/"),
      indexPath: path.relative(process.cwd(), path.join(packageRoot, "derived/indexes")).replaceAll("\\\\", "/")
    }
  };
  await writeFile(path.join(packageRoot, "manifest.json"), JSON.stringify(packageManifest, null, 2) + "\\n", "utf8");

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
