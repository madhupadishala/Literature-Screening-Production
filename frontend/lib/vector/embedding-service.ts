import type {
  EmbeddingRequest,
  EmbeddingResponse,
  VectorEmbeddingProvider,
} from "./vector-types";

const DEFAULT_DIMENSIONS = 128;

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function createMockEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return vector;
  }

  const tokens = normalizedText.split(" ");

  for (const token of tokens) {
    const position = hashToken(token) % dimensions;
    vector[position] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export class EmbeddingService {
  private provider: VectorEmbeddingProvider;

  constructor(provider: VectorEmbeddingProvider = "mock") {
    this.provider = provider;
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = request.provider ?? this.provider;
    const normalizedText = normalizeText(request.text);

    if (!normalizedText) {
      throw new Error("Embedding text cannot be empty.");
    }

    if (provider !== "mock") {
      throw new Error(
        `Embedding provider "${provider}" is not configured. Use "mock" for local development.`,
      );
    }

    const embedding = createMockEmbedding(normalizedText);

    return {
      embedding,
      provider,
      dimensions: embedding.length,
      generatedAt: new Date().toISOString(),
    };
  }

  getProvider(): VectorEmbeddingProvider {
    return this.provider;
  }

  setProvider(provider: VectorEmbeddingProvider): void {
    this.provider = provider;
  }
}

export const embeddingService = new EmbeddingService();