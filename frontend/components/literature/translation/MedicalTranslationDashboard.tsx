"use client";

import { useEffect, useState } from "react";

import type {
  MedicalTranslationResult,
  TranslationStatus,
} from "@/lib/literature/translation/translation-types";

interface ApiResponse {
  status: TranslationStatus;
  translations: MedicalTranslationResult[];
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

export default function MedicalTranslationDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadTranslations() {
    const response = await fetch("/api/literature/translation", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function runDemoTranslation() {
    await fetch("/api/literature/translation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        sourceText:
          "患者はパラセタモール投与後に肝障害を発現した。",
        preserveTerms: [
          "Paracetamol",
          "MedDRA",
          "WHO Drug",
        ],
      }),
    });

    await loadTranslations();
  }

  useEffect(() => {
    void loadTranslations();
  }, []);

  const status = data?.status;
  const translations = data?.translations ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Medical Translation
          </h2>

          <p className="text-sm text-slate-500">
            Language detection and medical translation with preservation of
            pharmacovigilance terminology.
          </p>
        </div>

        <button
          type="button"
          onClick={runDemoTranslation}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Demo Translation
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Translations"
          value={status?.totalTranslations ?? 0}
        />

        <MetricCard
          title="Average Confidence"
          value={`${status?.averageConfidence ?? 0}%`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Translation History
        </div>

        <div className="divide-y divide-slate-100">
          {translations.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No translations available.
            </div>
          ) : (
            translations.map((translation) => (
              <div key={translation.id} className="space-y-3 p-4">
                <div className="font-semibold text-slate-900">
                  {translation.sourceLanguage} → {translation.targetLanguage}
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase text-slate-400">
                    Original
                  </div>

                  <div className="mt-1 text-sm">
                    {translation.originalText}
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-3">
                  <div className="text-xs uppercase text-slate-400">
                    Translation
                  </div>

                  <div className="mt-1 text-sm">
                    {translation.translatedText}
                  </div>
                </div>

                <div className="text-xs text-slate-500">
                  Confidence: {translation.confidence}% · Preserved Terms:{" "}
                  {translation.preservedTerms.join(", ") || "None"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}