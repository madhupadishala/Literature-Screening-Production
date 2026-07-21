"use client";

import { useState } from "react";

import {
  getPromptConfigurations,
  updatePromptConfiguration,
} from "@/lib/ai/prompt-config-store";

import type { TenantPromptConfiguration } from "@/lib/tenant/tenant-types";

export default function PromptConfigPanel() {
  const [prompts, setPrompts] = useState<TenantPromptConfiguration[]>(
    () => getPromptConfigurations().prompts,
  );

  function updatePrompt(
    id: string,
    instruction: string
  ) {
    const updated = prompts.map((prompt) =>
      prompt.id === id
        ? {
            ...prompt,
            instruction,
          }
        : prompt
    );

    setPrompts(updated);

    const changed = updated.find((p) => p.id === id);

    if (changed) {
      updatePromptConfiguration(changed);
    }
  }

  return (
    <section>
      <h2>Prompt Configuration</h2>

      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          style={{
            marginBottom: 24,
            border: "1px solid #ddd",
            padding: 16,
            borderRadius: 8,
          }}
        >
          <h3>{prompt.name}</h3>

          <p>
            <strong>Area:</strong> {prompt.area}
          </p>

          <textarea
            rows={8}
            style={{
              width: "100%",
            }}
            value={prompt.instruction}
            onChange={(e) =>
              updatePrompt(prompt.id, e.target.value)
            }
          />

          <p>
            Version {prompt.version}
          </p>
        </div>
      ))}
    </section>
  );
}
