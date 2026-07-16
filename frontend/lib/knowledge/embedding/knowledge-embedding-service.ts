import "server-only";

import { ollamaBGEM3EmbeddingProvider } from "./ollama-bge-m3-provider";

import type {
  KnowledgeEmbeddingBatchRequest,
  KnowledgeEmbeddingHealth,
  KnowledgeEmbeddingInput,
} from "./embedding-types";

const MAX_BATCH_SIZE = 32;

function splitIntoBatches<T>(
  values: T[],
  batchSize: number,
) {
  const batches: T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += batchSize
  ) {
    batches.push(
      values.slice(index, index + batchSize),
    );
  }

  return batches;
}

export class KnowledgeEmbeddingService {
  async embedInputs(
    request: KnowledgeEmbeddingBatchRequest,
  ) {
    if (request.inputs.length === 0) {
      return {
        provider:
          ollamaBGEM3EmbeddingProvider.name,
        model:
          ollamaBGEM3EmbeddingProvider.model,
        vectors: [],
        inputCount: 0,
        dimensions:
          ollamaBGEM3EmbeddingProvider.dimensions,
        durationMs: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const seenIds = new Set<string>();

    for (const input of request.inputs) {
      if (seenIds.has(input.id)) {
        throw new Error(
          `Duplicate embedding input ID: ${input.id}`,
        );
      }

      seenIds.add(input.id);
    }

    const batches = splitIntoBatches(
      request.inputs,
      MAX_BATCH_SIZE,
    );

    const vectors = [];
    let totalDurationMs = 0;
    let model =
      ollamaBGEM3EmbeddingProvider.model;

    for (const batch of batches) {
      const result =
        await ollamaBGEM3EmbeddingProvider.embed({
          inputs: batch,
        });

      vectors.push(...result.vectors);
      totalDurationMs += result.durationMs;
      model = result.model;
    }

    return {
      provider:
        ollamaBGEM3EmbeddingProvider.name,
      model,
      vectors,
      inputCount: vectors.length,
      dimensions:
        ollamaBGEM3EmbeddingProvider.dimensions,
      durationMs: totalDurationMs,
      generatedAt: new Date().toISOString(),
    };
  }

  async embedTexts(
    texts: Array<{
      id: string;
      text: string;
      contentHash?: string;
    }>,
  ) {
    const inputs: KnowledgeEmbeddingInput[] =
      texts.map((item) => ({
        id: item.id,
        text: item.text,
        contentHash: item.contentHash,
      }));

    return this.embedInputs({
      inputs,
    });
  }

  async healthCheck():
    Promise<KnowledgeEmbeddingHealth> {
    return ollamaBGEM3EmbeddingProvider.healthCheck();
  }
}

export const knowledgeEmbeddingService =
  new KnowledgeEmbeddingService();