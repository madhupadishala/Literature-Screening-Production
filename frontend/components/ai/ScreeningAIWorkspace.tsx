"use client";

import { FormEvent, useState } from "react";

import type {
  ScreeningFinding,
  ScreeningResponse,
} from "@/lib/literature/screening/screening-types";

type ScreeningApiSuccessResponse = {
  success: true;
  data: ScreeningResponse;
};

type ScreeningApiErrorResponse = {
  success: false;
  error?: string;
  message?: string;
  validationErrors?: string[];
};

type ScreeningApiResponse =
  | ScreeningApiSuccessResponse
  | ScreeningApiErrorResponse;

type ScreeningFormState = {
  tenantId: string;
  pmid: string;
  title: string;
  abstract: string;
  authors: string;
  doi: string;
  journal: string;
};

const INITIAL_FORM: ScreeningFormState = {
  tenantId: "demo-tenant",
  pmid: "",
  title: "",
  abstract: "",
  authors: "",
  doi: "",
  journal: "",
};

function parseAuthors(value: string): string[] {
  return value
    .split(",")
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

function getDecisionClassName(
  decision: ScreeningResponse["decision"],
): string {
  switch (decision) {
    case "INCLUDE":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";

    case "EXCLUDE":
      return "border-red-200 bg-red-50 text-red-800";

    case "REVIEW":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getFindingStatus(
  finding: ScreeningFinding,
): string {
  return finding.passed ? "Passed" : "Not passed";
}

export default function ScreeningAIWorkspace() {
  const [form, setForm] =
    useState<ScreeningFormState>(INITIAL_FORM);

  const [result, setResult] =
    useState<ScreeningResponse | null>(null);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function updateField(
    field: keyof ScreeningFormState,
    value: string,
  ): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetWorkspace(): void {
    setForm(INITIAL_FORM);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setError(null);
    setResult(null);

    const tenantId = form.tenantId.trim();
    const pmid = form.pmid.trim();
    const title = form.title.trim();

    if (!tenantId) {
      setError("Tenant ID is required.");
      return;
    }

    if (!pmid) {
      setError("PMID is required.");
      return;
    }

    if (!title) {
      setError("Article title is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        "/api/literature/screening",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            tenantId,

            article: {
              pmid,
              title,
              abstract: form.abstract.trim(),
              authors: parseAuthors(form.authors),
              doi:
                form.doi.trim() || undefined,
              journal:
                form.journal.trim() || undefined,
            },
          }),
        },
      );

      let payload: ScreeningApiResponse;

      try {
        payload =
          (await response.json()) as ScreeningApiResponse;
      } catch {
        throw new Error(
          `Screening API returned an invalid response with status ${response.status}.`,
        );
      }

      if (!response.ok || !payload.success) {
        const apiError =
          !payload.success
            ? payload.validationErrors?.join(" ") ||
              payload.message ||
              payload.error
            : undefined;

        throw new Error(
          apiError ||
            `Screening request failed with status ${response.status}.`,
        );
      }

      setResult(payload.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "An unknown screening error occurred.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          ClinixAI Literature Screening
        </p>

        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Screening AI Workspace
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Submit literature metadata for deterministic and
          AI-assisted pharmacovigilance screening. Invalid AI
          output is validated before the final decision is
          returned.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Article information
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Tenant ID, PMID and article title are mandatory.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Tenant ID
              </span>

              <input
                type="text"
                value={form.tenantId}
                onChange={(event) =>
                  updateField(
                    "tenantId",
                    event.target.value,
                  )
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="demo-tenant"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                PMID
              </span>

              <input
                type="text"
                value={form.pmid}
                onChange={(event) =>
                  updateField(
                    "pmid",
                    event.target.value,
                  )
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Enter PubMed ID"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">
              Article title
            </span>

            <input
              type="text"
              value={form.title}
              onChange={(event) =>
                updateField(
                  "title",
                  event.target.value,
                )
              }
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              placeholder="Enter the complete article title"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">
              Abstract
            </span>

            <textarea
              value={form.abstract}
              onChange={(event) =>
                updateField(
                  "abstract",
                  event.target.value,
                )
              }
              disabled={isSubmitting}
              rows={8}
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              placeholder="Paste the article abstract"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">
              Authors
            </span>

            <input
              type="text"
              value={form.authors}
              onChange={(event) =>
                updateField(
                  "authors",
                  event.target.value,
                )
              }
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              placeholder="Author One, Author Two, Author Three"
            />

            <p className="text-xs text-slate-500">
              Separate multiple authors with commas.
            </p>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                DOI
              </span>

              <input
                type="text"
                value={form.doi}
                onChange={(event) =>
                  updateField(
                    "doi",
                    event.target.value,
                  )
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="10.xxxx/xxxxx"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Journal
              </span>

              <input
                type="text"
                value={form.journal}
                onChange={(event) =>
                  updateField(
                    "journal",
                    event.target.value,
                  )
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Journal name"
              />
            </label>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isSubmitting
                ? "Running screening..."
                : "Run screening"}
            </button>

            <button
              type="button"
              onClick={resetWorkspace}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Screening result
            </h2>

            {!result ? (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No screening result yet
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Complete the article information and run
                  screening.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div
                  className={`rounded-lg border p-4 ${getDecisionClassName(
                    result.decision,
                  )}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Final decision
                  </p>

                  <p className="mt-1 text-2xl font-bold">
                    {result.decision}
                  </p>
                </div>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      PMID
                    </dt>

                    <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                      {result.pmid}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Confidence
                    </dt>

                    <dd className="mt-1 text-sm font-medium text-slate-900">
                      {result.confidence}%
                    </dd>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reason
                    </dt>

                    <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                      {result.reason}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Workflow stage
                    </dt>

                    <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                      {result.workflowStage}
                    </dd>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4 sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Screened at
                    </dt>

                    <dd className="mt-1 text-sm font-medium text-slate-900">
                      {result.screenedAt}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>

          {result ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  Screening findings
                </h2>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {result.findings.length} findings
                </span>
              </div>

              {result.findings.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No structured findings were returned.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {result.findings.map(
                    (finding, index) => (
                      <article
                        key={`${finding.rule}-${index}`}
                        className="rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              {finding.rule}
                            </h3>

                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {finding.comment ||
                                "No comment provided."}
                            </p>
                          </div>

                          <span
                            className={
                              finding.passed
                                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                            }
                          >
                            {getFindingStatus(
                              finding,
                            )}
                          </span>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Finding score</span>
                            <span>{finding.score}</span>
                          </div>

                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-600"
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    finding.score,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}