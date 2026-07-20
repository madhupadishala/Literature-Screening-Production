import type { AIProviderType } from "./ai-types";

export interface AISettings {
  provider: AIProviderType;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  baseURL?: string;
}

const SUPPORTED_PROVIDERS: AIProviderType[] = ["openai", "groq"];

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveProvider(value: string | undefined): AIProviderType {
  const normalized = value?.trim().toLowerCase() as AIProviderType | undefined;
  return normalized && SUPPORTED_PROVIDERS.includes(normalized)
    ? normalized
    : "openai";
}

export function getAISettings(): AISettings {
  const provider = resolveProvider(process.env.AI_PROVIDER);
  const defaultModel =
    provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4.1-mini";

  return {
    provider,
    model: process.env.AI_MODEL?.trim() || defaultModel,
    temperature: Math.max(
      0,
      Math.min(2, readNumber(process.env.AI_TEMPERATURE, 0)),
    ),
    maxTokens: readPositiveInteger(process.env.AI_MAX_TOKENS, 4000),
    timeoutMs: readPositiveInteger(process.env.AI_TIMEOUT_MS, 60_000),
    maxAttempts: readPositiveInteger(process.env.AI_MAX_ATTEMPTS, 3),
    retryDelayMs: readPositiveInteger(process.env.AI_RETRY_DELAY_MS, 750),
    baseURL:
      process.env.AI_BASE_URL?.trim() ||
      (provider === "groq" ? "https://api.groq.com/openai/v1" : undefined),
  };
}

export const defaultAISettings = getAISettings();
