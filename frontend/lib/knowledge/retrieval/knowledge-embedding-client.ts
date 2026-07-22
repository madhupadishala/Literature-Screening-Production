import "server-only";

interface EmbeddingRuntime {
  provider: "ollama" | "openai" | "openai-compatible" | "azure-openai";
  model: string;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function timeout(): number {
  const value = Number.parseInt(process.env.KNOWLEDGE_EMBEDDING_TIMEOUT_MS || "", 10);
  return Number.isFinite(value) ? Math.min(600_000, Math.max(5_000, value)) : 120_000;
}

function runtime(): EmbeddingRuntime {
  const provider = (process.env.KNOWLEDGE_EMBEDDING_PROVIDER || "openai")
    .trim()
    .toLowerCase();
  if (provider === "ollama") {
    return {
      provider,
      model: required("KNOWLEDGE_EMBEDDING_MODEL"),
      url: `${(process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/u, "")}/api/embed`,
      headers: { "content-type": "application/json" },
      timeoutMs: timeout(),
    };
  }
  if (provider === "azure" || provider === "azure-openai") {
    const endpoint = required("AZURE_OPENAI_ENDPOINT").replace(/\/+$/u, "");
    const deployment = required("AZURE_OPENAI_EMBEDDING_DEPLOYMENT");
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-02-01";
    return {
      provider: "azure-openai",
      model: deployment,
      url: `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/embeddings?api-version=${encodeURIComponent(apiVersion)}`,
      headers: { "api-key": required("AZURE_OPENAI_API_KEY"), "content-type": "application/json" },
      timeoutMs: timeout(),
    };
  }
  if (provider === "openai" || provider === "openai-compatible") {
    const key = process.env.KNOWLEDGE_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (provider === "openai" || process.env.NODE_ENV === "production") {
      if (!key) throw new Error("KNOWLEDGE_EMBEDDING_API_KEY or OPENAI_API_KEY is required.");
    }
    return {
      provider,
      model: process.env.KNOWLEDGE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
      url: `${(
        process.env.KNOWLEDGE_EMBEDDING_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        "https://api.openai.com/v1"
      ).replace(/\/+$/u, "")}/embeddings`,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
      timeoutMs: timeout(),
    };
  }
  throw new Error("Unsupported controlled-knowledge embedding provider.");
}

export async function createKnowledgeQueryEmbedding(
  text: string,
): Promise<{ embedding: number[]; model: string; provider: string }> {
  const config = runtime();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const body =
      config.provider === "ollama"
        ? { model: config.model, input: [text], truncate: true }
        : { model: config.model, input: [text], encoding_format: "float" };
    const response = await fetch(config.url, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      embeddings?: number[][];
      data?: Array<{ embedding?: number[] }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Embedding request failed with HTTP ${response.status}.`);
    }
    const embedding =
      config.provider === "ollama"
        ? payload.embeddings?.[0]
        : payload.data?.[0]?.embedding;
    if (!embedding?.length || !embedding.every(Number.isFinite)) {
      throw new Error("Embedding provider returned an invalid query vector.");
    }
    return { embedding, model: config.model, provider: config.provider };
  } finally {
    clearTimeout(timer);
  }
}
