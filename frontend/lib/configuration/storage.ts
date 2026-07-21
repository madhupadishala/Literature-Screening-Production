import "server-only";

import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConfigurationResourceType } from "@/lib/configuration/types";

export interface StoredUpload {
  originalFilename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  absolutePath: string;
}

function safeSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "unnamed";
}

function getStorageRoot(): string {
  const configured = process.env.CONFIG_UPLOAD_ROOT?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error("CONFIG_UPLOAD_ROOT must be an absolute path.");
    }

    return path.normalize(configured);
  }

  const environment =
    process.env.APP_ENVIRONMENT?.trim().toLowerCase() ||
    process.env.NODE_ENV?.trim().toLowerCase();

  if (environment === "production") {
    throw new Error(
      "CONFIG_UPLOAD_ROOT must be configured in production.",
    );
  }

  return path.resolve(process.cwd(), "data", "configuration-uploads");
}

export async function storeConfigurationUpload(input: {
  tenantKey: string;
  resourceType: ConfigurationResourceType;
  file: File;
}): Promise<StoredUpload> {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const date = new Date();
  const datePath = [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ];

  const filename = safeSegment(input.file.name);
  const relativePath = path.join(
    safeSegment(input.tenantKey),
    input.resourceType.toLowerCase(),
    ...datePath,
    `${sha256.slice(0, 16)}-${filename}`,
  );

  const absolutePath = path.join(
    /* turbopackIgnore: true */ getStorageRoot(),
    relativePath,
  );
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    originalFilename: input.file.name,
    mediaType: input.file.type || "application/octet-stream",
    sizeBytes: buffer.length,
    sha256,
    storageKey: relativePath.replaceAll(path.sep, "/"),
    absolutePath,
  };
}

export async function quarantineConfigurationUpload(input: {
  tenantKey: string;
  resourceType: ConfigurationResourceType;
  stored: StoredUpload;
}): Promise<string> {
  const quarantineRelative = path.join(
    "quarantine",
    safeSegment(input.tenantKey),
    input.resourceType.toLowerCase(),
    path.basename(input.stored.absolutePath),
  );

  const quarantinePath = path.join(
    /* turbopackIgnore: true */ getStorageRoot(),
    quarantineRelative,
  );
  await mkdir(path.dirname(quarantinePath), { recursive: true });
  await rename(input.stored.absolutePath, quarantinePath);

  return quarantineRelative.replaceAll(path.sep, "/");
}
