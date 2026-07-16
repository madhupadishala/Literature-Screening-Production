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
    return memoryStorage.get(key);
  }

  async listObjects(prefix?: string): Promise<StorageObject[]> {
    return Array.from(memoryStorage.values())
      .filter((item) => !prefix || item.key.startsWith(prefix))
      .map(({ content: _content, ...object }) => object);
  }

  async deleteObject(key: string): Promise<boolean> {
    return memoryStorage.delete(key);
  }

  async health(): Promise<StorageHealth> {
    return {
      provider: this.provider,
      bucket: this.bucket,
      connected: true,
      checkedAt: new Date().toISOString(),
    };
  }
}

export const storageService = new StorageService();