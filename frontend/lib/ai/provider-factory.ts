import { getAISettings } from "./ai-settings";
import type { AIProvider } from "./ai-types";
import { openAIProvider } from "./providers/openai-provider";

export class AIProviderFactory {
  getProvider(): AIProvider {
    const settings = getAISettings();

    switch (settings.provider) {
      case "openai":
      case "groq":
        return openAIProvider;

      default:
        throw new Error(`Unsupported AI provider: ${settings.provider}`);
    }
  }
}

export const aiProviderFactory = new AIProviderFactory();
