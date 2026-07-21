"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  PromptStatus,
  PromptTemplate,
} from "@/lib/platform/prompts/prompt-types";

interface PromptApiResponse {
  status: PromptStatus;
  prompts: PromptTemplate[];
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function PromptDashboard() {
  const [data, setData] = useState<PromptApiResponse | null>(null);

  async function loadPrompts() {
    const response = await fetch("/api/platform/prompts", {
      cache: "no-store",
    });

    const result = (await response.json()) as PromptApiResponse;

    setData(result);
  }

  async function createDemoPrompt() {
    await fetch("/api/platform/prompts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: `prompt-demo-${Date.now()}`,
        name: "Demo RAG Prompt",
        category: "rag",
        version: "1.0.0",
        description: "Demo tenant-ready RAG prompt.",
        systemPrompt:
          "You are ClinixAI Enterprise RAG. Use only approved context.",
        userPrompt:
          "Question: {{query}}\n\nContext:\n{{context}}",
        variables: ["query", "context"],
        active: true,
      }),
    });

    await loadPrompts();
  }

  useDeferredLoad(loadPrompts);

  const status = data?.status;
  const prompts = data?.prompts ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Prompt Management
          </h2>

          <p className="text-sm text-slate-500">
            Central prompt registry, versioning and tenant override foundation.
          </p>
        </div>

        <button
          type="button"
          onClick={createDemoPrompt}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Create Demo Prompt
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Total Prompts"
          value={status?.totalPrompts ?? 0}
        />

        <MetricCard
          title="Active Prompts"
          value={status?.activePrompts ?? 0}
        />

        <MetricCard
          title="Tenant Overrides"
          value={status?.tenantOverrides ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Prompt Registry
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Prompt</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {prompts.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    No prompts registered.
                  </td>
                </tr>
              ) : (
                prompts.map((prompt) => (
                  <tr key={prompt.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {prompt.name}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {prompt.category}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {prompt.version}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {prompt.tenantId ?? "Global"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {prompt.active ? "Yes" : "No"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
