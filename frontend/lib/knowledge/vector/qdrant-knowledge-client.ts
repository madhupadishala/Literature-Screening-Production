import "server-only";

import { QdrantClient } from "@qdrant/js-client-rest";

import type {
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeVectorPayload,
  KnowledgeVectorPoint,
  VectorCollectionStatistics,
} from "./qdrant-types";

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_COLLECTION_NAME =
  "clinixai_literature_knowledge_v1";
const DEFAULT_VECTOR_SIZE = 1024;
const DEFAULT_UPSERT_BATCH_SIZE = 64;

export interface QdrantKnowledgeClientConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  upsertBatchSize: number;
}

interface QdrantErrorLike {
  status?: number;
  statusCode?: number;
  message?: string;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as QdrantErrorLike;
  const message = candidate.message?.toLowerCase() ?? "";

  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    message.includes("404") ||
    message.includes("not found") ||
    message.includes("doesn't exist") ||
    message.includes("does not exist")
  );
}

function isAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    (error as QdrantErrorLike).message?.toLowerCase() ?? "";

  return (
    message.includes("already exists") ||
    message.includes("already indexed") ||
    message.includes("already created")
  );
}

function splitIntoBatches<T>(
  values: T[],
  batchSize: number,
): T[][] {
  const batches: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += batchSize
  ) {
    batches.push(values.slice(index, index + batchSize));
  }

  return batches;
}

function assertFiniteVector(
  vector: number[],
  expectedSize: number,
  pointId: string,
): void {
  if (vector.length !== expectedSize) {
    throw new Error(
      `Vector point "${pointId}" has ${vector.length} dimensions; ` +
        `${expectedSize} dimensions are required.`,
    );
  }

  const invalidValueIndex = vector.findIndex(
    (value) => !Number.isFinite(value),
  );

  if (invalidValueIndex >= 0) {
    throw new Error(
      `Vector point "${pointId}" contains a non-finite value ` +
        `at index ${invalidValueIndex}.`,
    );
  }
}

function toQdrantPayload(
  payload: KnowledgeVectorPayload,
): Record<string, unknown> {
  /*
   * Qdrant accepts arbitrary JSON payloads. We explicitly copy the
   * strongly typed ClinixAI payload at this integration boundary.
   */
  return {
    ...payload,
  };
}

function assertSearchRequest(
  request: KnowledgeSearchRequest,
  vectorSize: number,
): void {
  if (!request.tenantId.trim()) {
    throw new Error("tenantId is required for knowledge search.");
  }

  if (
    !Number.isInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > 100
  ) {
    throw new Error(
      "Search limit must be an integer between 1 and 100.",
    );
  }

  if (request.queryEmbedding.length !== vectorSize) {
    throw new Error(
      `Search vector contains ${request.queryEmbedding.length} ` +
        `dimensions; ${vectorSize} dimensions are required.`,
    );
  }

  const invalidValueIndex = request.queryEmbedding.findIndex(
    (value) => !Number.isFinite(value),
  );

  if (invalidValueIndex >= 0) {
    throw new Error(
      `Search vector contains a non-finite value at index ` +
        `${invalidValueIndex}.`,
    );
  }

  if (
    request.scoreThreshold !== undefined &&
    !Number.isFinite(request.scoreThreshold)
  ) {
    throw new Error("scoreThreshold must be a finite number.");
  }
}

export function resolveQdrantKnowledgeClientConfig():
  QdrantKnowledgeClientConfig {
  return {
    url: normalizeUrl(
      process.env.QDRANT_URL ?? DEFAULT_QDRANT_URL,
    ),
    apiKey:
      process.env.QDRANT_API_KEY?.trim() || undefined,
    collectionName:
      process.env.QDRANT_COLLECTION?.trim() ||
      DEFAULT_COLLECTION_NAME,
    vectorSize: readPositiveInteger(
      process.env.QDRANT_VECTOR_DIMENSIONS,
      DEFAULT_VECTOR_SIZE,
    ),
    upsertBatchSize: readPositiveInteger(
      process.env.QDRANT_UPSERT_BATCH_SIZE,
      DEFAULT_UPSERT_BATCH_SIZE,
    ),
  };
}

export class QdrantKnowledgeClient {
  readonly config: QdrantKnowledgeClientConfig;

  private readonly client: QdrantClient;

  constructor(
    config: QdrantKnowledgeClientConfig =
      resolveQdrantKnowledgeClientConfig(),
  ) {
    this.config = config;

    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
      checkCompatibility: false,
    });
  }

  async collectionExists(): Promise<boolean> {
    try {
      await this.client.getCollection(
        this.config.collectionName,
      );

      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  async ensureCollection(): Promise<{
    created: boolean;
    collectionName: string;
    vectorSize: number;
  }> {
    const exists = await this.collectionExists();

    if (!exists) {
      await this.client.createCollection(
        this.config.collectionName,
        {
          vectors: {
            size: this.config.vectorSize,
            distance: "Cosine",
          },
          on_disk_payload: true,
        },
      );

      await this.ensurePayloadIndexes();

      return {
        created: true,
        collectionName: this.config.collectionName,
        vectorSize: this.config.vectorSize,
      };
    }

    const information =
      await this.client.getCollection(
        this.config.collectionName,
      );

    const vectorsConfig =
      information.config?.params?.vectors;

    if (
      vectorsConfig &&
      !Array.isArray(vectorsConfig) &&
      "size" in vectorsConfig &&
      typeof vectorsConfig.size === "number" &&
      vectorsConfig.size !== this.config.vectorSize
    ) {
      throw new Error(
        `Qdrant collection "${this.config.collectionName}" uses ` +
          `${vectorsConfig.size} dimensions, but ClinixAI expects ` +
          `${this.config.vectorSize}.`,
      );
    }

    await this.ensurePayloadIndexes();

    return {
      created: false,
      collectionName: this.config.collectionName,
      vectorSize: this.config.vectorSize,
    };
  }

  async upsertPoints(
    points: KnowledgeVectorPoint[],
  ): Promise<number> {
    if (points.length === 0) {
      return 0;
    }

    await this.ensureCollection();

    const seenPointIds = new Set<string>();

    for (const point of points) {
      if (!point.id.trim()) {
        throw new Error(
          "Every Qdrant knowledge point requires an ID.",
        );
      }

      if (seenPointIds.has(point.id)) {
        throw new Error(
          `Duplicate Qdrant point ID detected: ${point.id}`,
        );
      }

      seenPointIds.add(point.id);

      assertFiniteVector(
        point.vector,
        this.config.vectorSize,
        point.id,
      );
    }

    const batches = splitIntoBatches(
      points,
      this.config.upsertBatchSize,
    );

    let indexedPointCount = 0;

    for (const batch of batches) {
      await this.client.upsert(
        this.config.collectionName,
        {
          wait: true,
          points: batch.map((point) => ({
            id: point.id,
            vector: point.vector,
            payload: toQdrantPayload(point.payload),
          })),
        },
      );

      indexedPointCount += batch.length;
    }

    return indexedPointCount;
  }

  async deleteByDocumentId(
    documentId: string,
  ): Promise<void> {
    const normalizedDocumentId = documentId.trim();

    if (!normalizedDocumentId) {
      throw new Error("documentId is required.");
    }

    if (!(await this.collectionExists())) {
      return;
    }

    await this.client.delete(
      this.config.collectionName,
      {
        wait: true,
        filter: {
          must: [
            {
              key: "documentId",
              match: {
                value: normalizedDocumentId,
              },
            },
          ],
        },
      },
    );
  }

  async deleteByChecksum(
    checksum: string,
  ): Promise<void> {
    const normalizedChecksum = checksum.trim();

    if (!normalizedChecksum) {
      throw new Error("checksum is required.");
    }

    if (!(await this.collectionExists())) {
      return;
    }

    await this.client.delete(
      this.config.collectionName,
      {
        wait: true,
        filter: {
          must: [
            {
              key: "checksum",
              match: {
                value: normalizedChecksum,
              },
            },
          ],
        },
      },
    );
  }

  async search(
    request: KnowledgeSearchRequest,
  ): Promise<KnowledgeSearchResult[]> {
    assertSearchRequest(
      request,
      this.config.vectorSize,
    );

    if (!(await this.collectionExists())) {
      return [];
    }

    const must = [
      {
        key: "tenantId",
        match: {
          any: [
            request.tenantId.trim(),
            "global",
          ],
        },
      },
    ];

    if (request.category?.trim()) {
      must.push({
        key: "category",
        match: {
          any: [request.category.trim()],
        },
      });
    }

    if (request.regulation?.trim()) {
      must.push({
        key: "regulation",
        match: {
          any: [request.regulation.trim()],
        },
      });
    }

    if (request.tags && request.tags.length > 0) {
      const normalizedTags = Array.from(
        new Set(
          request.tags
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      );

      if (normalizedTags.length > 0) {
        must.push({
          key: "tags",
          match: {
            any: normalizedTags,
          },
        } as (typeof must)[number]);
      }
    }

    const results = await this.client.search(
      this.config.collectionName,
      {
        vector: request.queryEmbedding,
        limit: request.limit,
        score_threshold:
          request.scoreThreshold,
        with_payload: true,
        with_vector: false,
        filter: {
          must,
        },
      },
    );

    return results.flatMap(
      (result): KnowledgeSearchResult[] => {
        if (!result.payload) {
          return [];
        }

        return [
          {
            id: String(result.id),
            score: result.score,
            payload:
              result.payload as unknown as KnowledgeVectorPayload,
          },
        ];
      },
    );
  }

  async getStatistics():
    Promise<VectorCollectionStatistics> {
    const exists = await this.collectionExists();

    if (!exists) {
      return {
        collectionName:
          this.config.collectionName,
        vectors: 0,
        indexedVectors: 0,
        status: "missing",
      };
    }

    const information =
      await this.client.getCollection(
        this.config.collectionName,
      );

    const pointCount =
      information.points_count ?? 0;

    const indexedVectorCount =
      information.indexed_vectors_count ??
      pointCount;

    return {
      collectionName:
        this.config.collectionName,
      vectors: pointCount,
      indexedVectors:
        indexedVectorCount,
      status: information.status ?? "unknown",
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    url: string;
    collectionName: string;
    collectionExists: boolean;
    vectorSize: number;
    vectorsIndexed: number;
    status: string;
    checkedAt: string;
    error?: string;
  }> {
    const checkedAt = new Date().toISOString();

    try {
      const exists =
        await this.collectionExists();

      if (!exists) {
        return {
          healthy: true,
          url: this.config.url,
          collectionName:
            this.config.collectionName,
          collectionExists: false,
          vectorSize:
            this.config.vectorSize,
          vectorsIndexed: 0,
          status: "missing",
          checkedAt,
        };
      }

      const statistics =
        await this.getStatistics();

      return {
        healthy: true,
        url: this.config.url,
        collectionName:
          this.config.collectionName,
        collectionExists: true,
        vectorSize:
          this.config.vectorSize,
        vectorsIndexed:
          statistics.vectors,
        status: statistics.status,
        checkedAt,
      };
    } catch (error) {
      return {
        healthy: false,
        url: this.config.url,
        collectionName:
          this.config.collectionName,
        collectionExists: false,
        vectorSize:
          this.config.vectorSize,
        vectorsIndexed: 0,
        status: "unavailable",
        checkedAt,
        error:
          error instanceof Error
            ? error.message
            : "Unknown Qdrant connection failure.",
      };
    }
  }

  private async ensurePayloadIndexes():
    Promise<void> {
    /*
     * These fields are used by tenant isolation, governance,
     * filtering, source replacement and retrieval.
     */
    const keywordFields = [
      "tenantId",
      "chunkId",
      "documentId",
      "documentName",
      "documentType",
      "source",
      "regulation",
      "version",
      "category",
      "section",
      "subsection",
      "language",
      "tags",
      "checksum",
    ];

    for (const fieldName of keywordFields) {
      try {
        await this.client.createPayloadIndex(
          this.config.collectionName,
          {
            field_name: fieldName,
            field_schema: "keyword",
            wait: true,
          },
        );
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }
      }
    }

    const datetimeFields = [
      "effectiveDate",
      "createdAt",
      "updatedAt",
    ];

    for (const fieldName of datetimeFields) {
      try {
        await this.client.createPayloadIndex(
          this.config.collectionName,
          {
            field_name: fieldName,
            field_schema: "datetime",
            wait: true,
          },
        );
      } catch (error) {
        if (!isAlreadyExistsError(error)) {
          throw error;
        }
      }
    }
  }
}

export const qdrantKnowledgeClient =
  new QdrantKnowledgeClient();
