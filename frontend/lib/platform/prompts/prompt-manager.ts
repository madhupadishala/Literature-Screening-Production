import { promptRegistry } from "./prompt-registry";
import type { PromptRequest, PromptTemplate } from "./prompt-types";

function createDefaultPrompt(): PromptTemplate {
  return {
    id: "system-default",
    name: "Default System Prompt",
    category: "system",
    version: "1.0.0",
    systemPrompt:
      "You are the ClinixAI Enterprise AI Platform.",
    userPrompt: "{{query}}",
    variables: ["query"],
    active: true,
    createdAt: new Date().toISOString(),
  };
}

class PromptManager {
  constructor() {
    if (promptRegistry.list().length === 0) {
      promptRegistry.register(createDefaultPrompt());
    }
  }

  getPrompt(request: PromptRequest) {
    return promptRegistry.get(request);
  }

  registerPrompt(prompt: PromptTemplate) {
    return promptRegistry.register(prompt);
  }

  listPrompts() {
    return promptRegistry.list();
  }

  getStatus() {
    return promptRegistry.status();
  }
}

export const promptManager = new PromptManager();