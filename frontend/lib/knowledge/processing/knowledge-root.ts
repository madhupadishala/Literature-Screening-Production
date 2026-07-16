import "server-only";

import { access, mkdir } from "node:fs/promises";
import path from "node:path";

const KNOWLEDGE_ROOT_ENVIRONMENT_VARIABLE =
  "CLINIXAI_KNOWLEDGE_ROOT";

function defaultKnowledgeRoot() {
  /*
   * Next.js commands run from:
   * C:\Users\Hp\Literature-Screening-Production\frontend
   *
   * The existing knowledge repository is:
   * C:\Users\Hp\Literature-Screening-Production\knowledge
   */
  return path.resolve(process.cwd(), "..", "knowledge");
}

export function resolveKnowledgeRoot() {
  const configuredRoot =
    process.env[KNOWLEDGE_ROOT_ENVIRONMENT_VARIABLE]?.trim();

  return path.resolve(
    configuredRoot || defaultKnowledgeRoot(),
  );
}

export async function ensureKnowledgeRoot() {
  const rootPath = resolveKnowledgeRoot();

  await mkdir(rootPath, {
    recursive: true,
  });

  await access(rootPath);

  return rootPath;
}