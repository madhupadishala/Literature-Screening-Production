import "server-only";

import { access, mkdir } from "node:fs/promises";
import path from "node:path";

const KNOWLEDGE_ROOT_ENVIRONMENT_VARIABLE =
  "CLINIXAI_KNOWLEDGE_ROOT";

function defaultKnowledgeRoot(): string {
  /*
   * Next.js commands run from:
   * C:\Users\Hp\Literature-Screening-Production\frontend
   *
   * The existing knowledge repository is:
   * C:\Users\Hp\Literature-Screening-Production\knowledge
   */
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "..",
    "knowledge",
  );
}

export function resolveKnowledgeRoot(): string {
  const configuredRoot =
    process.env[KNOWLEDGE_ROOT_ENVIRONMENT_VARIABLE]?.trim();

  if (!configuredRoot) return defaultKnowledgeRoot();

  if (!path.isAbsolute(configuredRoot)) {
    throw new Error(
      `${KNOWLEDGE_ROOT_ENVIRONMENT_VARIABLE} must be an absolute path.`,
    );
  }

  return path.normalize(configuredRoot);
}

export async function ensureKnowledgeRoot() {
  const rootPath = resolveKnowledgeRoot();

  await mkdir(rootPath, {
    recursive: true,
  });

  await access(rootPath);

  return rootPath;
}
