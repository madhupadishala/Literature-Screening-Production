"use client";

import { useEffect, useState } from "react";
import type {
  AICompletionResponse,
  AIGatewayStatus,
} from "@/lib/platform/ai/gateway/ai-gateway-types";

interface GatewayApiResponse {
  status: AIGatewayStatus;
  history: AICompletionResponse[];
}

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function AIGatewayDashboard() {
  const [data, setData] = useState<GatewayApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadGateway() {
    setLoading(true);

    try {
      const response = await fetch("/api/platform/ai/gateway", {
        cache: "no-store",
      });

      const result = (await response.json()) as GatewayApiResponse;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  async function runTestCompletion() {
    await fetch("/api/platform/ai/gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        useCase: "gateway_diagnostics",
        messages: [
          {
            role: "system",
            content: "You are the ClinixAI production alpha AI gateway.",
          },
          {
            role: "user",
            content: "Return a short diagnostic response.",
          },
        ],
      }),
    });

    await loadGateway();
  }

  useEffect(() => {
    void loadGateway();
  }, []);

  const status = data?.status;
  const history = data?.history ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">AI Gateway</h2>
          <p className="text-sm text-slate-500">
            Central provider abstraction for LLM calls across PV Nexus modules.
          </p>
        </div>

        <button
          type="button"
          onClick={runTestCompletion}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Test Completion
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Default Provider"
          value={status?.defaultProvider ?? "—"}
        />
        <MetricCard title="Default Model" value={status?.defaultModel ?? "—"} />
        <MetricCard
          title="Providers"
          value={status?.providers.length ?? 0}
        />
        <MetricCard
          title="Requests"
          value={status?.requestsHandled ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Request History {loading ? "· Loading..." : ""}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Tokens</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No AI gateway requests found.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {item.id}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.provider}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.model}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.totalTokens}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.latencyMs}ms
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(item.createdAt).toLocaleString()}
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