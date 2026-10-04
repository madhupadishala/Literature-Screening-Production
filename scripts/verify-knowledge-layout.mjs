import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("knowledge");

const requiredPaths = [
  "README.md",
  "SOP/README.md",
  "Regulatory/README.md",
  "Controlled-Approved-Knowledge/README.md",
  "Scenarios/README.md",
  "Scenarios/Templates/scenario.schema.json",
  "_system/policy/scenario-retrieval-policy.v1.json",
  "_system/pipeline/knowledge-ingestion-pipeline.v1.json",
  "_system/schemas/document-package.schema.json",
  "SOP/Literature/Reference/SVS-SOP-PV-006/v1.0/manifest.json",
  "SOP/Literature/Reference/SVS-SOP-PV-006/v1.0/source/source-transcription.md",
  "SOP/Literature/Internal/Literature-Safety-Surveillance/v0.1/manifest.json",
  "SOP/Literature/Internal/Literature-Safety-Surveillance/v0.1/source/master-sop.md",
  "Controlled-Approved-Knowledge/Repository-v1.0/07_Indexes_and_Loader/knowledge.json",
  "Controlled-Approved-Knowledge/Repository-v1.0/07_Indexes_and_Loader/chunks.jsonl",
  "Regulatory/EMA/GVP/Module-VI-Rev2/manifest.json",
  "Regulatory/EMA/GVP/Module-VI-Rev2/source/document.pdf",
  "Regulatory/coverage.v1.json",
  "Labeling/README.md",
  "Labeling/Templates/manifest.template.json",
  "_system/schemas/labeling-document.schema.json",
  "_system/policy/labeling-resolution-policy.v1.json"
];

const prohibitedLegacyPaths = [
  "Rules",
  "controlled",
  "SOP/Sources",
  "SOP/Master",
  "Regulatory/EMA/GVP/source",
  "Controlled-Approved-Knowledge/Golden-Cases"
];

const labelingDocumentTypes = [
  "SmPC","CCDS","IB","USPI","PI","PIL","Package-Insert","Core-Safety-Information","Other"
];

const scenarioFolders = [
  "Scenarios/General",
  "Scenarios/Edge-Cases",
  "Scenarios/Ambiguous-Conflicting",
  "Scenarios/Multi-Drug",
  "Scenarios/Special-Situations",
  "Scenarios/ICSR-Validity",
  "Scenarios/Seriousness",
  "Scenarios/Causality",
  "Scenarios/Literature-Screening",
  "Scenarios/Aggregate-Safety",
  "Scenarios/Signal",
  "Scenarios/Duplicate",
  "Scenarios/Day-Zero",
  "Scenarios/Cross-Engine",
  "Scenarios/Adversarial",
  "Scenarios/Regression",
  "Scenarios/Golden-Cases",
  "Scenarios/Templates"
];

const documentPackages = [
  "Regulatory/EMA/GVP/Module-I",
  "Regulatory/EMA/GVP/Module-VI-Rev2",
  "Regulatory/EMA/GVP/Module-VI-Addendum-I",
  "Regulatory/EMA/GVP/Module-VI-Addendum-II",
  "Regulatory/EMA/GVP/Module-VII-Rev1",
  "Regulatory/EMA/GVP/Module-VIII-Rev3",
  "Regulatory/EMA/GVP/Module-IX-Rev1",
  "Regulatory/EMA/GVP/Annex-I-Rev5",
  "Regulatory/EMA/GVP/PSC-III-Pregnancy-Breastfeeding-2026",
  "SOP/Literature/Reference/SVS-SOP-PV-006/v1.0",
  "SOP/Literature/Internal/Literature-Safety-Surveillance/v0.1"
];

async function exists(relative) {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

for (const relative of requiredPaths) {
  assert(await exists(relative), `Missing required knowledge path: ${relative}`);
}

for (const documentType of labelingDocumentTypes) {
  const base = path.join(
    "Labeling","_Template","Product-Brand-Name","Generic-Name","Country",documentType,"_Version"
  );
  for (const child of [
    "source",
    "derived/parsed",
    "derived/chunks",
    "derived/embeddings",
    "derived/indexes",
    "qa"
  ]) {
    assert(await exists(path.join(base, child)), `Incomplete labeling package template: ${base}/${child}`);
  }
}

for (const scenarioFolder of scenarioFolders) {
  assert(await exists(scenarioFolder), `Missing scenario folder: ${scenarioFolder}`);
}

for (const relative of documentPackages) {
  for (const child of [
    "source",
    "derived/parsed",
    "derived/chunks",
    "derived/embeddings",
    "derived/indexes",
    "qa"
  ]) {
    assert(await exists(path.join(relative, child)), `Incomplete document package: ${relative}/${child}`);
  }
}

for (const legacy of prohibitedLegacyPaths) {
  assert(!(await exists(legacy)), `Legacy mixed knowledge path must be removed: knowledge/${legacy}`);
}

const controlledRoot = path.join(root, "Controlled-Approved-Knowledge");
const controlledFiles = await walk(controlledRoot);
const forbiddenExtensions = new Set([".pdf", ".docx", ".doc"]);
for (const file of controlledFiles) {
  assert(
    !forbiddenExtensions.has(path.extname(file).toLowerCase()),
    `Raw source document found inside Controlled Approved Knowledge: ${path.relative(root, file)}`
  );
}

const coverage = JSON.parse(await readFile(path.join(root, "Regulatory/coverage.v1.json"), "utf8"));
assert(Array.isArray(coverage.families) && coverage.families.length >= 10, "Regulatory coverage registry is incomplete.");

console.log("PV Knowledge Centre layout verification passed.");
console.table([
  {
    document_packages: documentPackages.length,
    controlled_files_checked: controlledFiles.length,
    regulatory_families: coverage.families.length,
    scenario_folders: scenarioFolders.length,
    labeling_document_types: labelingDocumentTypes.length,
    legacy_paths: 0
  }
]);
