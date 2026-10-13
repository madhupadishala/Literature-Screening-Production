import { getAISettings } from "./ai-settings";

export interface AIRuntimeValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface AIRuntimeValidationResult {
  valid: boolean;
  provider: string;
  model: string;
  checks: AIRuntimeValidationCheck[];
  validatedAt: string;
}

function hasProviderApiKey(provider: string): boolean {
  if (provider === "groq") {
    return Boolean(process.env.GROQ_API_KEY || process.env.AI_API_KEY);
  }

  if (provider === "openai") {
    return Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  }

  if (provider === "ollama") return true;

  return false;
}

export function validateAIRuntime(): AIRuntimeValidationResult {
  const settings = getAISettings();

  const checks: AIRuntimeValidationCheck[] = [
    {
      name: "provider",
      passed: settings.provider === "openai" || settings.provider === "groq" || settings.provider === "ollama",
      message: `Configured provider: ${settings.provider}`,
    },
    {
      name: "model",
      passed: settings.model.trim().length > 0,
      message: settings.model.trim().length > 0
        ? `Configured model: ${settings.model}`
        : "AI_MODEL is missing.",
    },
    {
      name: "api_key",
      passed: hasProviderApiKey(settings.provider),
      message: hasProviderApiKey(settings.provider)
        ? settings.provider === "ollama"
          ? "Local Ollama provider does not require an API key."
          : "Provider API key is configured."
        : "Provider API key is missing.",
    },
    {
      name: "timeout",
      passed: settings.timeoutMs >= 1_000 && settings.timeoutMs <= 300_000,
      message: `Timeout: ${settings.timeoutMs} ms`,
    },
    {
      name: "attempts",
      passed: settings.maxAttempts >= 1 && settings.maxAttempts <= 5,
      message: `Maximum attempts: ${settings.maxAttempts}`,
    },
    {
      name: "retry_delay",
      passed: settings.retryDelayMs >= 100 && settings.retryDelayMs <= 30_000,
      message: `Retry delay: ${settings.retryDelayMs} ms`,
    },
    {
      name: "max_tokens",
      passed: settings.maxTokens >= 256 && settings.maxTokens <= 32_768,
      message: `Maximum output tokens: ${settings.maxTokens}`,
    },
    {
      name: "temperature",
      passed: settings.temperature >= 0 && settings.temperature <= 2,
      message: `Temperature: ${settings.temperature}`,
    },
  ];

  return {
    valid: checks.every((check) => check.passed),
    provider: settings.provider,
    model: settings.model,
    checks,
    validatedAt: new Date().toISOString(),
  };
}
