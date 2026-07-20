export type AiProviderId = "openai" | "groq" | "azure-openai" | "custom";

export interface AiProviderConfiguration {
  provider: AiProviderId;
  model?: string;
  configured: boolean;
  supportedByRuntime: boolean;
  missingVariables: string[];
  healthUrl?: string;
  endpoint?: string;
  message: string;
}

const DEFAULT_SUPPORTED_PROVIDERS: AiProviderId[] = ["openai"];

export function getAiProviderConfiguration(): AiProviderConfiguration {
  const provider = normalizeProvider(
    process.env.AI_PROVIDER || process.env.LLM_PROVIDER || "openai",
  );
  const supportedProviders = getSupportedProviders();
  const supportedByRuntime = supportedProviders.includes(provider);

  const configuration = providerConfiguration(provider);
  const configured =
    supportedByRuntime && configuration.missingVariables.length === 0;

  return {
    provider,
    model: configuration.model,
    configured,
    supportedByRuntime,
    missingVariables: configuration.missingVariables,
    healthUrl:
      process.env.AI_HEALTH_URL?.trim() ||
      process.env.AI_PROVIDER_HEALTH_URL?.trim() ||
      undefined,
    endpoint: configuration.endpoint,
    message: buildMessage({
      provider,
      supportedByRuntime,
      configured,
      missingVariables: configuration.missingVariables,
      supportedProviders,
    }),
  };
}

export function getSupportedProviders(): AiProviderId[] {
  const raw = process.env.AI_RUNTIME_SUPPORTED_PROVIDERS?.trim();
  if (!raw) return DEFAULT_SUPPORTED_PROVIDERS;

  const supported = raw
    .split(",")
    .map((value) => normalizeProvider(value.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);

  return supported.length > 0 ? supported : DEFAULT_SUPPORTED_PROVIDERS;
}

function providerConfiguration(provider: AiProviderId): {
  model?: string;
  endpoint?: string;
  missingVariables: string[];
} {
  switch (provider) {
    case "openai":
      return {
        model:
          process.env.OPENAI_MODEL?.trim() ||
          process.env.AI_MODEL?.trim() ||
          "gpt-4.1-mini",
        endpoint:
          process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
        missingVariables: missing("OPENAI_API_KEY"),
      };

    case "groq":
      return {
        model:
          process.env.GROQ_MODEL?.trim() ||
          process.env.AI_MODEL?.trim() ||
          "llama-3.3-70b-versatile",
        endpoint:
          process.env.GROQ_BASE_URL?.trim() ||
          "https://api.groq.com/openai/v1",
        missingVariables: missing("GROQ_API_KEY"),
      };

    case "azure-openai":
      return {
        model:
          process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
          process.env.AI_MODEL?.trim(),
        endpoint: process.env.AZURE_OPENAI_ENDPOINT?.trim() || undefined,
        missingVariables: [
          ...missing("AZURE_OPENAI_API_KEY"),
          ...missing("AZURE_OPENAI_ENDPOINT"),
          ...missing("AZURE_OPENAI_DEPLOYMENT"),
        ],
      };

    case "custom":
      return {
        model: process.env.AI_MODEL?.trim() || undefined,
        endpoint: process.env.AI_PROVIDER_URL?.trim() || undefined,
        missingVariables: missing("AI_PROVIDER_URL"),
      };
  }
}

function missing(name: string): string[] {
  return process.env[name]?.trim() ? [] : [name];
}

function normalizeProvider(value: string): AiProviderId {
  const normalized = value.trim().toLowerCase();

  if (normalized === "groq") return "groq";
  if (
    normalized === "azure" ||
    normalized === "azure-openai" ||
    normalized === "azure_openai"
  ) {
    return "azure-openai";
  }
  if (normalized === "custom" || normalized === "remote") return "custom";
  return "openai";
}

function buildMessage(input: {
  provider: AiProviderId;
  supportedByRuntime: boolean;
  configured: boolean;
  missingVariables: string[];
  supportedProviders: AiProviderId[];
}): string {
  if (!input.supportedByRuntime) {
    return `AI provider ${input.provider} is selected but the current runtime supports only ${input.supportedProviders.join(", ")}.`;
  }

  if (!input.configured) {
    return `AI provider ${input.provider} is missing: ${input.missingVariables.join(", ")}.`;
  }

  return `AI provider ${input.provider} is configured for the current runtime.`;
}
