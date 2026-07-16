import type {
  PromptRequest,
  PromptStatus,
  PromptTemplate,
} from "./prompt-types";

class PromptRegistry {
  private prompts = new Map<string, PromptTemplate>();

  register(prompt: PromptTemplate) {
    this.prompts.set(prompt.id, prompt);

    return prompt;
  }

  get(request: PromptRequest) {
    const prompts = Array.from(this.prompts.values());

    const tenantPrompt = prompts.find(
      (item) =>
        item.category === request.category &&
        item.tenantId === request.tenantId &&
        item.active,
    );

    if (tenantPrompt) {
      return tenantPrompt;
    }

    return (
      prompts.find(
        (item) =>
          item.category === request.category &&
          !item.tenantId &&
          item.active,
      ) ?? null
    );
  }

  list() {
    return Array.from(this.prompts.values());
  }

  status(): PromptStatus {
    const prompts = this.list();

    return {
      totalPrompts: prompts.length,
      activePrompts: prompts.filter((item) => item.active).length,
      tenantOverrides: prompts.filter((item) => item.tenantId).length,
    };
  }
}

export const promptRegistry = new PromptRegistry();