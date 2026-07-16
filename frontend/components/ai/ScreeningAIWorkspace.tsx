"use client";

import { useState } from "react";

import type { ScreeningAgentResponse } from "@/lib/ai/screening-agent";

export default function ScreeningAIWorkspace() {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [productName, setProductName] = useState("");
  const [country, setCountry] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [abstractText, setAbstractText] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScreeningAgentResponse | null>(null);

  async function runScreening() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ai/screening", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          articleTitle,
          abstractText,
          productName: productName || undefined,
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
          : "Unknown screening error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-6">
      <h2 className="mb-6 text-2xl font-semibold">
        Screening AI Workspace
      </h2>

      <div className="grid gap-4">
        <input
          className="rounded-md border p-2"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="Tenant ID"
        />

        <input
          className="rounded-md border p-2"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Company Product"
        />

        <input
          className="rounded-md border p-2"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
        />

        <textarea
          className="rounded-md border p-2"
          rows={2}
          value={articleTitle}
          onChange={(e) => setArticleTitle(e.target.value)}
          placeholder="Article Title"
        />

        <textarea
          className="rounded-md border p-2"
          rows={8}
          value={abstractText}
          onChange={(e) => setAbstractText(e.target.value)}
          placeholder="Abstract"
        />

        <button
          className="rounded-md bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
          onClick={runScreening}
          disabled={loading}
        >
          {loading ? "Running Screening..." : "Run Screening AI"}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-md bg-red-100 p-3 text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-5">
          <div className="rounded-lg border bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">
                  Classification
                </div>

                <div className="text-xl font-semibold">
                  {result.result.classification}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-gray-500">
                  Confidence
                </div>

                <div className="text-3xl font-bold">
                  {(result.result.confidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">Validity</h3>

              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  Patient:{" "}
                  {result.result.validity.hasIdentifiablePatient ? "✅" : "❌"}
                </li>

                <li>
                  Reporter:{" "}
                  {result.result.validity.hasIdentifiableReporter ? "✅" : "❌"}
                </li>

                <li>
                  Company Product:{" "}
                  {result.result.validity.hasCompanySuspectProduct
                    ? "✅"
                    : "❌"}
                </li>

                <li>
                  Adverse Event:{" "}
                  {result.result.validity.hasAdverseEvent ? "✅" : "❌"}
                </li>

                <li>
                  Valid Case:{" "}
                  {result.result.validity.isValidCase ? "✅" : "❌"}
                </li>
              </ul>
            </div>

            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">Patient</h3>

              <div className="mt-3 text-sm">
                Age: {result.result.patient.age ?? "-"}
              </div>

              <div className="text-sm">
                Sex: {result.result.patient.sex ?? "-"}
              </div>

              <div className="text-sm">
                Country: {result.result.patient.country ?? "-"}
              </div>

              <div className="mt-3">
                <strong>Identifiers</strong>

                <ul className="list-disc pl-5 text-sm">
                  {result.result.patient.identifiers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">Products</h3>

              <div className="mt-3">
                <strong>Company Suspects</strong>

                <ul className="list-disc pl-5 text-sm">
                  {result.result.products.companySuspects.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                <strong>Concomitants</strong>

                <ul className="list-disc pl-5 text-sm">
                  {result.result.products.concomitants.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-5">
              <h3 className="font-semibold">Events</h3>

              <div className="mt-3">
                <strong>Adverse Events</strong>

                <ul className="list-disc pl-5 text-sm">
                  {result.result.events.adverseEvents.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4">
                <strong>Seriousness</strong>

                <ul className="list-disc pl-5 text-sm">
                  {result.result.events.seriousnessCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-5">
            <h3 className="font-semibold">Reviewer Notes</h3>

            <ul className="mt-3 list-disc pl-5 text-sm">
              {result.result.reviewerNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border bg-emerald-50 p-5">
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
                  <div className="flex items-center justify-between">
                    <strong>{chunk.source}</strong>

                    <span className="text-xs">
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