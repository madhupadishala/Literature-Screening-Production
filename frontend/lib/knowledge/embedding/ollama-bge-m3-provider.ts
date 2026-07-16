import "server-only";

import type { KnowledgeEmbeddingProvider } from "./embedding-provider";

import {
  KnowledgeEmbeddingError,
  type KnowledgeEmbeddingBatchRequest,
  type KnowledgeEmbeddingBatchResult,
  type KnowledgeEmbeddingHealth,
  type KnowledgeEmbeddingProviderConfig,
  type KnowledgeEmbeddingVector,
  type OllamaEmbedResponse,
} from "./embedding-types";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "bge-m3";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeInputText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function calculateMagnitude(vector: number[]) {
  const squaredSum = vector.reduce(
    (sum, value) => sum + value * value,
    0,
  );

  return Math.sqrt(squaredSum);
}

function isFiniteVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item === "number" &&
        Number.isFinite(item),
    )
  );
}

function resolveErrorCode(error: unknown) {
  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return "PROVIDER_TIMEOUT" as const;
  }

  return "PROVIDER_UNAVAILABLE" as const;
}

export function resolveOllamaEmbeddingConfig():
  KnowledgeEmbeddingProviderConfig {
  return {
    provider: "ollama",
    baseUrl: normalizeBaseUrl(
      process.env.OLLAMA_BASE_URL ??
        DEFAULT_BASE_URL,
    ),
    model:
      process.env.OLLAMA_EMBEDDING_MODEL?.trim() ||
      DEFAULT_MODEL,
    expectedDimensions: readPositiveInteger(
      process.env.OLLAMA_EMBEDDING_DIMENSIONS,
      DEFAULT_DIMENSIONS,
    ),
    timeoutMs: readPositiveInteger(
      process.env.OLLAMA_EMBEDDING_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
  };
}

export class OllamaBGEM3EmbeddingProvider
  implements KnowledgeEmbeddingProvider
{
  readonly name = "ollama" as const;

  readonly model: string;

  readonly dimensions: number;

  constructor(
    private readonly config =
      resolveOllamaEmbeddingConfig(),
  ) {
    this.model = config.model;
    this.dimensions = config.expectedDimensions;
  }

  async embed(
    request: KnowledgeEmbeddingBatchRequest,
  ): Promise<KnowledgeEmbeddingBatchResult> {
    if (request.inputs.length === 0) {
      throw new KnowledgeEmbeddingError(
        "At least one embedding input is required.",
        "EMPTY_INPUT",
      );
    }

    const normalizedInputs = request.inputs.map(
      (input) => ({
        ...input,
        text: normalizeInputText(input.text),
      }),
    );

    const emptyInput = normalizedInputs.find(
      (input) => !input.text,
    );

    if (emptyInput) {
      throw new KnowledgeEmbeddingError(
        `Embedding input ${emptyInput.id} contains no usable text.`,
        "EMPTY_INPUT",
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/embed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            input: normalizedInputs.map(
              (input) => input.text,
            ),
            truncate: false,
          }),
          cache: "no-store",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const responseText = await response
          .text()
          .catch(() => "");

        throw new KnowledgeEmbeddingError(
          [
            `Ollama embedding request failed with HTTP ${response.status}.`,
            responseText,
          ]
            .filter(Boolean)
            .join(" "),
          "EMBEDDING_FAILURE",
        );
      }

      const payload =
        (await response.json()) as OllamaEmbedResponse;

      if (
        !Array.isArray(payload.embeddings) ||
        payload.embeddings.length !==
          normalizedInputs.length
      ) {
        throw new KnowledgeEmbeddingError(
          "Ollama returned an invalid embedding response count.",
          "INVALID_RESPONSE",
        );
      }

      const vectors: KnowledgeEmbeddingVector[] =
        payload.embeddings.map(
          (vector, index) => {
            if (!isFiniteVector(vector)) {
              throw new KnowledgeEmbeddingError(
                `Embedding response ${index} is not a valid numeric vector.`,
                "INVALID_RESPONSE",
              );
            }

            if (
              vector.length !==
              this.config.expectedDimensions
            ) {
              throw new KnowledgeEmbeddingError(
                `Embedding dimension mismatch. Expected ${this.config.expectedDimensions}, received ${vector.length}.`,
                "DIMENSION_MISMATCH",
              );
            }

            const input = normalizedInputs[index];

            return {
              inputId: input.id,
              vector,
              dimensions: vector.length,
              magnitude: calculateMagnitude(vector),
            };
          },
        );

      return {
        provider: this.name,
        model: payload.model || this.model,
        vectors,
        inputCount: vectors.length,
        dimensions: this.dimensions,
        durationMs: Date.now() - startedAt,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof KnowledgeEmbeddingError) {
        throw error;
      }

      throw new KnowledgeEmbeddingError(
        error instanceof Error
          ? `Ollama embedding request failed: ${error.message}`
          : "Ollama embedding request failed.",
        resolveErrorCode(error),
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<KnowledgeEmbeddingHealth> {
    try {
      const result = await this.embed({
        inputs: [
          {
            id: "clinixai-embedding-health-check",
            text: "Pharmacovigilance literature screening knowledge health check.",
          },
        ],
      });

      return {
        healthy: true,
        provider: this.name,
        model: result.model,
        baseUrl: this.config.baseUrl,
        expectedDimensions:
          this.config.expectedDimensions,
        actualDimensions:
          result.vectors[0]?.dimensions,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.name,
        model: this.model,
        baseUrl: this.config.baseUrl,
        expectedDimensions:
          this.config.expectedDimensions,
        checkedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Unknown embedding health-check failure.",
      };
    }
  }
}

export const ollamaBGEM3EmbeddingProvider =
  new OllamaBGEM3EmbeddingProvider();