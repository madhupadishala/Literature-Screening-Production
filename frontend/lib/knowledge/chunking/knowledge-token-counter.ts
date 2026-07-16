import "server-only";

export interface TokenCounter {
  count(text: string): number;
}

class ApproximateTokenCounter implements TokenCounter {
  count(text: string): number {
    if (!text.trim()) {
      return 0;
    }

    // Conservative approximation:
    // ~1 token ≈ 4 characters for English regulatory text.
    return Math.ceil(text.length / 4);
  }
}

export class KnowledgeTokenCounter {
  private readonly provider: TokenCounter =
    new ApproximateTokenCounter();

  count(text: string) {
    return this.provider.count(text);
  }

  fits(text: string, maximumTokens: number) {
    return this.count(text) <= maximumTokens;
  }
}

export const knowledgeTokenCounter =
  new KnowledgeTokenCounter();