"use client";

import { useState } from "react";

import type { HitsAgentResponse } from "@/lib/ai/hits-agent";

export default function HitsAIReviewPanel() {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [product, setProduct] = useState("");
  const [country, setCountry] = useState("");

  const [title, setTitle] = useState("");
  const [abstractText, setAbstractText] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HitsAgentResponse | null>(null);
  const [error, setError] = useState("");

  async function runHitsAI() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ai/hits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          articleTitle: title,
          abstractText,
          productName: product || undefined,
          country: country || undefined,
        }),
      });

      const json = await response.json();

      if (!json.success) {
        throw new Error(json.message);
      }

      setResult(json.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-6">

      <h2 className="mb-5 text-2xl font-semibold">
        Hits AI Review Panel
      </h2>

      <div className="grid gap-4">

        <input
          className="rounded-md border p-2"
          placeholder="Tenant ID"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
        />

        <input
          className="rounded-md border p-2"
          placeholder="Product"
          value={product}
          onChange={(event) => setProduct(event.target.value)}
        />

        <input
          className="rounded-md border p-2"
          placeholder="Country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        />

        <textarea
          className="rounded-md border p-2"
          rows={2}
          placeholder="Article Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <textarea
          className="rounded-md border p-2"
          rows={8}
          placeholder="Abstract"
          value={abstractText}
          onChange={(event) => setAbstractText(event.target.value)}
        />

        <button
          className="rounded-md bg-blue-600 px-5 py-2 text-white"
          onClick={runHitsAI}
          disabled={loading}
        >
          {loading ? "Running AI..." : "Run Hits AI"}
        </button>

      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-100 p-4 text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-5">

          <div className="rounded-lg border bg-white p-5">

            <div className="flex justify-between">

              <div>

                <h3 className="text-lg font-semibold">
                  AI Decision
                </h3>

                <div className="mt-2">

                  <span className="rounded bg-slate-100 px-3 py-1 text-sm">
                    {result.result.classification}
                  </span>

                </div>

              </div>

              <div className="text-right">

                <div className="text-sm text-gray-500">
                  Confidence
                </div>

                <div className="text-2xl font-bold">
                  {(result.result.confidence * 100).toFixed(0)}%
                </div>

              </div>

            </div>

          </div>

          <div className="rounded-lg border bg-white p-5">

            <h3 className="font-semibold">
              AI Reasoning
            </h3>

            <ul className="mt-3 list-disc pl-5">
              {result.result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

          </div>

          <div className="grid gap-4 md:grid-cols-2">

            <div className="rounded-lg border bg-white p-5">

              <h3 className="font-semibold">
                Products
              </h3>

              {result.result.detectedProducts.length === 0 ? (
                <div className="mt-2 text-gray-500">
                  None
                </div>
              ) : (
                <ul className="mt-2 list-disc pl-5">
                  {result.result.detectedProducts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}

            </div>

            <div className="rounded-lg border bg-white p-5">

              <h3 className="font-semibold">
                Events
              </h3>

              {result.result.detectedEvents.length === 0 ? (
                <div className="mt-2 text-gray-500">
                  None
                </div>
              ) : (
                <ul className="mt-2 list-disc pl-5">
                  {result.result.detectedEvents.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}

            </div>

          </div>

          <div className="rounded-lg border bg-green-50 p-5">

            <div className="text-sm text-gray-500">
              Recommended Workflow
            </div>

            <div className="mt-2 text-lg font-semibold">
              {result.result.recommendedNextStep}
            </div>

          </div>

          <details className="rounded-lg border bg-white p-5">

            <summary className="cursor-pointer font-semibold">
              Enterprise RAG Context
            </summary>

            <div className="mt-4">

              <div className="mb-4 rounded bg-slate-100 p-3 text-sm">
                {result.ragContext.summary}
              </div>

              {result.ragContext.chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="mb-4 rounded border p-3"
                >
                  <div className="flex justify-between">

                    <strong>
                      {chunk.source}
                    </strong>

                    <span>
                      {chunk.priority}
                    </span>

                  </div>

                  <div className="mt-2 text-sm">
                    {chunk.content}
                  </div>

                </div>
              ))}

            </div>

          </details>

        </div>
      )}

    </div>
  );
}