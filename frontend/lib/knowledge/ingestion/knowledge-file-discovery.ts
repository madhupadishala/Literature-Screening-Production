import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  DiscoveredKnowledgeFile,
  KnowledgeFileCategory,
  KnowledgeLayer,
  RegulatoryAuthority,
} from "./knowledge-ingestion-types";

const IGNORED_NAMES = new Set([
  ".gitkeep",
  ".ds_store",
  "thumbs.db",
  ".clinixai-ingestion-manifest.json",
]);

const IGNORED_DIRECTORIES = new Set([
  "chroma_db",
  "vector_index",
  "node_modules",
  ".git",
  ".next",
]);

function normalizePath(value: string) {
  return value.replaceAll("\\", "/");
}

function getSegments(relativePath: string) {
  return normalizePath(relativePath)
    .split("/")
    .filter(Boolean);
}

function getLowerSegments(relativePath: string) {
  return getSegments(relativePath).map((segment) => segment.toLowerCase());
}

function resolveLayer(relativePath: string): KnowledgeLayer {
  const segments = getLowerSegments(relativePath);

  if (segments.includes("regulatory")) {
    return "regulatory";
  }

  if (segments.includes("clients")) {
    return "customer";
  }

  if (
    segments.includes("products") ||
    segments.includes("dictionaries")
  ) {
    return "customer";
  }

  return "clinixai";
}

function resolveAuthority(relativePath: string): RegulatoryAuthority {
  const segments = getLowerSegments(relativePath);

  if (segments.includes("ema")) return "EMA";
  if (segments.includes("fda")) return "FDA";
  if (segments.includes("mhra")) return "MHRA";
  if (segments.includes("pmda")) return "PMDA";
  if (segments.includes("ich")) return "ICH";
  if (segments.includes("cioms")) return "CIOMS";

  const fileName = path.basename(relativePath).toLowerCase();

  if (fileName.includes("ema")) return "EMA";
  if (fileName.includes("fda")) return "FDA";
  if (fileName.includes("mhra")) return "MHRA";
  if (fileName.includes("pmda")) return "PMDA";
  if (fileName.includes("ich")) return "ICH";
  if (fileName.includes("cioms")) return "CIOMS";

  return "UNKNOWN";
}

function extractTenantFromFileName(fileName: string) {
  const match = fileName.match(/^(.+?)_(product_master|mah_countries)/i);

  return match?.[1] || undefined;
}

function resolveTenantId(relativePath: string) {
  const segments = getSegments(relativePath);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());

  const clientsIndex = lowerSegments.indexOf("clients");

  if (clientsIndex >= 0) {
    return segments[clientsIndex + 1] || undefined;
  }

  const fileName = path.basename(relativePath);

  return extractTenantFromFileName(fileName);
}

function resolveRuleCategory(
  fileName: string,
): KnowledgeFileCategory {
  const normalized = fileName.toLowerCase();

  if (normalized.includes("product")) {
    return "product_rule";
  }

  if (normalized.includes("search")) {
    return "search_rule";
  }

  if (normalized.includes("translation")) {
    return "translation_rule";
  }

  if (normalized.includes("prompt")) {
    return "prompt_rule";
  }

  return "business_rule";
}

function resolveCategory(
  relativePath: string,
  layer: KnowledgeLayer,
): KnowledgeFileCategory {
  const segments = getLowerSegments(relativePath);
  const fileName = path.basename(relativePath);

  if (segments.includes("sop")) {
    return "sop";
  }

  if (
    segments.includes("work-instructions") ||
    segments.includes("work_instruction") ||
    segments.includes("wi")
  ) {
    return "work_instruction";
  }

  if (segments.includes("rules")) {
    return resolveRuleCategory(fileName);
  }

  if (segments.includes("products")) {
    return "product_master";
  }

  if (segments.includes("dictionaries")) {
    return "dictionary";
  }

  if (segments.includes("clients")) {
    return "customer_rule";
  }

  if (segments.includes("regulatory") || layer === "regulatory") {
    return "regulatory_guidance";
  }

  return "unknown";
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  output: DiscoveredKnowledgeFile[],
) {
  const entries = await readdir(currentPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const normalizedName = entry.name.toLowerCase();

    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(normalizedName)) {
      continue;
    }

    if (entry.name.startsWith(".")) {
      continue;
    }

    if (IGNORED_NAMES.has(normalizedName)) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(rootPath, absolutePath, output);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    const relativePath = normalizePath(
      path.relative(rootPath, absolutePath),
    );
    const extension = path.extname(entry.name).toLowerCase();
    const layer = resolveLayer(relativePath);

    output.push({
      absolutePath,
      relativePath,
      fileName: entry.name,
      extension,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      layer,
      category: resolveCategory(relativePath, layer),
      authority: resolveAuthority(relativePath),
      tenantId: resolveTenantId(relativePath),
    });
  }
}

export async function discoverKnowledgeFiles(rootPath: string) {
  const files: DiscoveredKnowledgeFile[] = [];

  await walkDirectory(rootPath, rootPath, files);

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}