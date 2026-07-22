import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(
  process.cwd(),
  "..",
  "knowledge",
  "controlled",
  "ClinixAI_Knowledge_Repository_v1.0",
);

const expectedFamilies = new Map([
  ["CDS", 20],
  ["LF", 30],
  ["SI", 10],
  ["DB", 10],
  ["SDI", 10],
  ["OI", 10],
  ["VAL", 10],
]);

const approvedStatus = "Approved";
const draftStatus = "Draft – Requires Approval";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function relativeFile(relativePath) {
  const normalized = path.normalize(relativePath);
  const absolute = path.resolve(repositoryRoot, normalized);
  const relative = path.relative(repositoryRoot, absolute);
  assert(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `Unsafe controlled-repository path: ${relativePath}`,
  );
  return absolute;
}

async function verifyChecksumManifest() {
  const manifest = await readFile(
    path.join(repositoryRoot, "checksums.sha256"),
    "utf8",
  );
  const entries = manifest
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/u);
      assert(match, `Invalid checksum manifest entry: ${line}`);
      return { expectedHash: match[1], relativePath: match[2] };
    });

  assert(entries.length > 0, "The controlled checksum manifest is empty.");

  for (const entry of entries) {
    const content = await readFile(relativeFile(entry.relativePath));
    assert(
      sha256(content) === entry.expectedHash,
      `Checksum mismatch: ${entry.relativePath}`,
    );
  }

  return entries.length;
}

function verifyKnowledgeObject(object) {
  const requiredStrings = [
    "id",
    "title",
    "domain",
    "rule",
    "status",
    "version",
    "regulatory_reference",
    "file",
    "rule_hash_sha256",
    "document_hash_sha256",
  ];

  for (const field of requiredStrings) {
    assert(
      typeof object[field] === "string" && object[field].trim().length > 0,
      `${object.id || "Unknown object"}: ${field} is required.`,
    );
  }

  assert(
    /^(?:LF|SI|DB|SDI|OI|VAL|CDS)-\d{3}$/u.test(object.id),
    `${object.id}: invalid Knowledge Object identifier.`,
  );
  assert(
    object.status === approvedStatus || object.status === draftStatus,
    `${object.id}: invalid governance status.`,
  );
  assert(
    typeof object.effective_for_production === "boolean",
    `${object.id}: effective_for_production must be boolean.`,
  );
  assert(
    /^[a-f0-9]{64}$/u.test(object.rule_hash_sha256),
    `${object.id}: invalid controlled-rule hash.`,
  );
  assert(
    /^[a-f0-9]{64}$/u.test(object.document_hash_sha256),
    `${object.id}: invalid document hash.`,
  );
  assert(
    sha256(Buffer.from(object.rule, "utf8")) === object.rule_hash_sha256,
    `${object.id}: controlled governing statement hash mismatch.`,
  );

  if (object.status === approvedStatus) {
    assert(
      object.effective_for_production === true,
      `${object.id}: Approved knowledge must be production eligible.`,
    );
  } else {
    assert(
      object.effective_for_production === false,
      `${object.id}: Draft knowledge must not be production eligible.`,
    );
  }
}

async function verifyObjects() {
  const registryPath = path.join(
    repositoryRoot,
    "07_Indexes_and_Loader",
    "knowledge.json",
  );
  const objects = JSON.parse(await readFile(registryPath, "utf8"));
  assert(Array.isArray(objects), "knowledge.json must contain an array.");
  assert(objects.length === 100, `Expected 100 Knowledge Objects; found ${objects.length}.`);

  const ids = new Set();
  const familyCounts = new Map();
  let approved = 0;
  let draft = 0;

  for (const object of objects) {
    verifyKnowledgeObject(object);
    assert(!ids.has(object.id), `Duplicate Knowledge Object ID: ${object.id}`);
    ids.add(object.id);

    const family = object.id.split("-")[0];
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);

    const document = await readFile(relativeFile(object.file));
    assert(
      sha256(document) === object.document_hash_sha256,
      `${object.id}: controlled document hash mismatch.`,
    );

    if (object.status === approvedStatus) approved += 1;
    if (object.status === draftStatus) draft += 1;
  }

  assert(approved === 80, `Expected 80 Approved objects; found ${approved}.`);
  assert(draft === 20, `Expected 20 Draft objects; found ${draft}.`);

  for (const [family, expected] of expectedFamilies) {
    assert(
      familyCounts.get(family) === expected,
      `Expected ${expected} ${family} objects; found ${familyCounts.get(family) || 0}.`,
    );
  }

  for (let index = 1; index <= 20; index += 1) {
    const id = `CDS-${String(index).padStart(3, "0")}`;
    const object = objects.find((candidate) => candidate.id === id);
    assert(object, `${id} is missing.`);
    assert(object.status === draftStatus, `${id} must remain Draft.`);
    assert(object.effective_for_production === false, `${id} must remain non-production.`);
  }

  return { objects, ids, approved, draft, familyCounts };
}

async function verifyChunks(objectsById) {
  const chunkPath = path.join(
    repositoryRoot,
    "07_Indexes_and_Loader",
    "chunks.jsonl",
  );
  const lines = (await readFile(chunkPath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  assert(lines.length === 1700, `Expected 1700 chunks; found ${lines.length}.`);

  const chunkIds = new Set();
  const representedObjects = new Set();
  let approvedChunks = 0;
  let draftChunks = 0;

  for (const [index, line] of lines.entries()) {
    let chunk;
    try {
      chunk = JSON.parse(line);
    } catch (error) {
      throw new Error(`chunks.jsonl:${index + 1}: invalid JSON: ${error.message}`);
    }

    assert(typeof chunk.chunk_id === "string" && chunk.chunk_id, `Chunk ${index + 1}: missing ID.`);
    assert(!chunkIds.has(chunk.chunk_id), `Duplicate chunk ID: ${chunk.chunk_id}`);
    chunkIds.add(chunk.chunk_id);

    const object = objectsById.get(chunk.ko_id);
    assert(object, `${chunk.chunk_id}: unknown Knowledge Object ${chunk.ko_id}.`);
    representedObjects.add(chunk.ko_id);
    assert(chunk.status === object.status, `${chunk.chunk_id}: status mismatch.`);
    assert(
      chunk.effective_for_production === object.effective_for_production,
      `${chunk.chunk_id}: production eligibility mismatch.`,
    );
    assert(typeof chunk.text === "string" && chunk.text.length > 0, `${chunk.chunk_id}: empty text.`);
    assert(
      sha256(Buffer.from(chunk.text, "utf8")) === chunk.content_hash_sha256,
      `${chunk.chunk_id}: content hash mismatch.`,
    );

    if (chunk.status === approvedStatus && chunk.effective_for_production === true) {
      approvedChunks += 1;
    } else {
      assert(
        chunk.status === draftStatus && chunk.effective_for_production === false,
        `${chunk.chunk_id}: invalid production governance combination.`,
      );
      draftChunks += 1;
    }
  }

  assert(representedObjects.size === 100, `Expected chunks for 100 objects; found ${representedObjects.size}.`);
  assert(approvedChunks === 1360, `Expected 1360 Approved chunks; found ${approvedChunks}.`);
  assert(draftChunks === 340, `Expected 340 Draft chunks; found ${draftChunks}.`);

  return { total: lines.length, approvedChunks, draftChunks };
}

async function verifyMetadata() {
  const metadata = JSON.parse(
    await readFile(path.join(repositoryRoot, "07_Indexes_and_Loader", "metadata.json"), "utf8"),
  );
  assert(metadata.version === "1.0.0", `Unexpected repository version: ${metadata.version}`);
  assert(metadata.knowledge_objects_total === 100, "Metadata object count is not 100.");
  assert(metadata.approved_objects === 80, "Metadata Approved count is not 80.");
  assert(metadata.draft_governance_objects === 20, "Metadata Draft count is not 20.");
  assert(metadata.vector_chunks_total === 1700, "Metadata chunk count is not 1700.");
  return metadata;
}

async function main() {
  const checksumEntries = await verifyChecksumManifest();
  const objectResult = await verifyObjects();
  const objectsById = new Map(objectResult.objects.map((object) => [object.id, object]));
  const chunkResult = await verifyChunks(objectsById);
  const metadata = await verifyMetadata();

  console.log("ClinixAI controlled Knowledge Repository verification passed.");
  console.table([
    {
      repository: metadata.repository_name,
      version: metadata.version,
      checksum_entries: checksumEntries,
      knowledge_objects: objectResult.objects.length,
      approved_objects: objectResult.approved,
      draft_objects: objectResult.draft,
      vector_chunks: chunkResult.total,
      approved_chunks: chunkResult.approvedChunks,
      excluded_draft_chunks: chunkResult.draftChunks,
    },
  ]);
}

main().catch((error) => {
  console.error("Controlled Knowledge Repository verification failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
