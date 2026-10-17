import { createHash } from "node:crypto";
import { r2ObjectStorage } from "./cloudflare-r2";
import type {
  StorageHealth,
  StorageObject,
  StorageProvider,
} from "./storage-types";

interface PutObjectInput {
  key: string;
  content: string;
  contentType: string;
  metadata?: Record<string, string>;
}

const memoryStorage = new Map<string, StorageObject & { content: string }>();

function calculateSizeBytes(content: string): number {
  return new TextEncoder().encode(content).length;
}

function simpleChecksum(content: string): string {
  let hash = 0;

  for (let index = 0; index < content.length; index += 1) {
    hash = (hash << 5) - hash + content.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

export class StorageService {
  private readonly provider: StorageProvider =
    (process.env.CLINIXAI_STORAGE_PROVIDER as StorageProvider) ??
    "memory-development";

  private readonly bucket =
    process.env.CLINIXAI_STORAGE_BUCKET ?? "clinixai-dev";

  async putObject(input: PutObjectInput): Promise<StorageObject> {
    const object: StorageObject = {
      key: input.key,
      bucket: this.bucket,
      provider: this.provider,
      contentType: input.contentType,
      sizeBytes: calculateSizeBytes(input.content),
      checksum: simpleChecksum(input.content),
      createdAt: new Date().toISOString(),
      metadata: input.metadata,
    };

    if (this.provider === "cloudflare-r2") {
      const data = Buffer.from(input.content, "utf8");
      await r2ObjectStorage.put(input.key, data, input.contentType);
      return { ...object, checksum: createHash("sha256").update(data).digest("hex") };
    }
    if (process.env.NODE_ENV === "production" && this.provider === "memory-development") {
      throw new Error("Volatile memory storage is prohibited in production");
    }
    if (this.provider !== "memory-development") {
      throw new Error(
        `${this.provider} provider is not wired yet. Current Sprint 26 foundation uses memory-development with S3-ready contracts.`,
      );
    }

    memoryStorage.set(input.key, {
      ...object,
      content: input.content,
    });

    return object;
  }

  async getObject(
    key: string,
  ): Promise<(StorageObject & { content: string }) | undefined> {
    if (this.provider === "cloudflare-r2") {
      const data = await r2ObjectStorage.get(key);
      return { key, bucket: this.bucket, provider: this.provider, contentType: "application/octet-stream", sizeBytes: data.length, checksum: createHash("sha256").update(data).digest("hex"), createdAt: "", content: data.toString("utf8") };
    }
    return memoryStorage.get(key);
  }

  async listObjects(prefix?: string): Promise<StorageObject[]> {
    if (this.provider === "cloudflare-r2") throw new Error("R2 object listing requires an authorized persistent document registry");
    return Array.from(memoryStorage.values())
      .filter((item) => !prefix || item.key.startsWith(prefix))
      .map((item) => ({
        key: item.key,
        bucket: item.bucket,
        provider: item.provider,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum,
        createdAt: item.createdAt,
        metadata: item.metadata,
      }));
  }

  async deleteObject(key: string): Promise<boolean> {
    if (this.provider === "cloudflare-r2") { await r2ObjectStorage.remove(key); return true; }
    return memoryStorage.delete(key);
  }

  async health(): Promise<StorageHealth> {
    return {
      provider: this.provider,
      bucket: this.bucket,
      connected: this.provider === "cloudflare-r2" ? Boolean(process.env.CLOUDFLARE_R2_ACCOUNT_ID && process.env.CLOUDFLARE_R2_ACCESS_KEY_ID && process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY && process.env.CLINIXAI_STORAGE_BUCKET) : this.provider === "memory-development" && process.env.NODE_ENV !== "production",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const storageService = new StorageService();
