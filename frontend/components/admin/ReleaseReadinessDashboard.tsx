"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GateStatus = "passed" | "failed" | "pending" | "waived";
type EvidenceOutcome = "passed" | "failed" | "blocked";

interface Gate {
  id: string;
  title: string;
  status: GateStatus;
  mandatory: boolean;
  message: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  ownerRole: string;
  mandatory: boolean;
  status: GateStatus;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  category: string;
  mode: "automated" | "manual";
  mandatory: boolean;
  acceptanceCriteria: string[];
}

interface Evidence {
  scenarioId: string;
  outcome: EvidenceOutcome;
  executedAt: string;
  executedBy: string;
  notes?: string;
}

interface ReadinessReport {
  ready: boolean;
  checkedAt: string;
  manifest: {
    version: string;
    releaseName: string;
    buildSha: string;
    environment: string;
    manifestHash: string;
    architectureBoundary: string;
  };
  gates: Gate[];
  checklist: ChecklistItem[];
  uat: {
    scenarios: Scenario[];
    latestEvidence: Evidence[];
    mandatoryPassed: number;
    mandatoryTotal: number;
  };
  smoke?: {
    id: string;
    passed: boolean;
    completedAt: string;
  };
  candidates: Array<{
    id: string;
    version: string;
    buildSha: string;
    createdAt: string;
    createdBy: string;
  }>;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

export default function ReleaseReadinessDashboard(): React.ReactElement {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [token, setToken] = useState("");
  const [operator, setOperator] = useState("release-operator");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setToken(window.sessionStorage.getItem("clinix-release-token") || "");
    setOperator(window.sessionStorage.getItem("clinix-release-operator") || "release-operator");
  }, []);

  const headers = useCallback(
    (json = false): HeadersInit => ({
      accept: "application/json",
      ...(json ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-monitoring-token": token } : {}),
    }),
    [token],
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/release/status", {
        cache: "no-store",
        headers: headers(),
      });
      const payload = (await response.json()) as ApiEnvelope<ReadinessReport>;
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error?.message || "Release readiness is unavailable.");
      }
      setReport(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Release readiness is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestEvidence = useMemo(
    () => new Map(report?.uat.latestEvidence.map((item) => [item.scenarioId, item]) || []),
    [report],
  );

  async function action(name: string, url: string, body: unknown): Promise<void> {
    try {
      setWorking(name);
      setError(null);
      window.sessionStorage.setItem("clinix-release-token", token);
      window.sessionStorage.setItem("clinix-release-operator", operator);
      const response = await fetch(url, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error?.message || `${name} failed.`);
      }
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${name} failed.`);
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Loading release readiness…</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-medium text-slate-700">
            Release operator
            <input
              value={operator}
              onChange={(event: { target: { value: string } }) => setOperator(event.target.value)}
              className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Internal token
            <input
              type="password"
              value={token}
              onChange={(event: { target: { value: string } }) => setToken(event.target.value)}
              placeholder="Required in production"
              className="mt-1 block w-full rounded-lg border px-3 py-2 font-normal"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </section>
      ) : null}

      {report ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Release status" value={report.ready ? "READY" : "BLOCKED"} />
            <Metric label="Version" value={report.manifest.version} />
            <Metric label="UAT passed" value={`${report.uat.mandatoryPassed}/${report.uat.mandatoryTotal}`} />
            <Metric label="Smoke suite" value={report.smoke ? (report.smoke.passed ? "PASSED" : "FAILED") : "PENDING"} />
          </section>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Release identity</h2>
                <p className="mt-1 text-sm text-slate-500">{report.manifest.architectureBoundary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  disabled={Boolean(working)}
                  onClick={() => action("Automated UAT", "/api/release/uat/run", { executedBy: operator })}
                >
                  {working === "Automated UAT" ? "Running…" : "Run automated UAT"}
                </ActionButton>
                <ActionButton
                  disabled={Boolean(working)}
                  onClick={() => action("Smoke suite", "/api/release/smoke", { executedBy: operator })}
                >
                  {working === "Smoke suite" ? "Running…" : "Run smoke suite"}
                </ActionButton>
                <ActionButton
                  disabled={Boolean(working) || !report.ready}
                  onClick={() => action("Release candidate", "/api/release/candidate", { createdBy: operator })}
                >
                  {working === "Release candidate" ? "Creating…" : "Create release candidate"}
                </ActionButton>
              </div>
            </div>
            <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
              <Info label="Release" value={report.manifest.releaseName} />
              <Info label="Build SHA" value={report.manifest.buildSha} />
              <Info label="Environment" value={report.manifest.environment} />
              <Info label="Manifest" value={report.manifest.manifestHash.slice(0, 16)} />
            </dl>
          </section>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Release gates</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Gate</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.gates.map((gate) => (
                    <tr key={gate.id}>
                      <td className="px-3 py-3 font-medium text-slate-900">{gate.title}</td>
                      <td className="px-3 py-3"><StatusBadge status={gate.status} /></td>
                      <td className="px-3 py-3 text-slate-600">{gate.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Manual PV UAT</h2>
            <p className="mt-1 text-sm text-slate-500">
              Record governed evidence for each mandatory Literature Screening acceptance scenario.
            </p>
            <div className="mt-5 space-y-4">
              {report.uat.scenarios.filter((scenario) => scenario.mode === "manual").map((scenario) => {
                const evidence = latestEvidence.get(scenario.id);
                return (
                  <div key={scenario.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{scenario.id} · {scenario.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{scenario.description}</p>
                      </div>
                      <StatusBadge status={evidence?.outcome === "passed" ? "passed" : evidence?.outcome === "failed" ? "failed" : "pending"} />
                    </div>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                      {scenario.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
                    </ul>
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                      <label className="text-xs font-medium text-slate-600">
                        Evidence notes
                        <input
                          value={notes[scenario.id] || ""}
                          onChange={(event: { target: { value: string } }) => setNotes((current) => ({ ...current, [scenario.id]: event.target.value }))}
                          placeholder="Test package, observations, evidence location"
                          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal"
                        />
                      </label>
                      {(["passed", "failed", "blocked"] as EvidenceOutcome[]).map((outcome) => (
                        <button
                          key={outcome}
                          type="button"
                          disabled={Boolean(working)}
                          onClick={() => action(`UAT ${scenario.id}`, "/api/release/uat/evidence", {
                            scenarioId: scenario.id,
                            outcome,
                            executedBy: operator,
                            notes: notes[scenario.id],
                          })}
                          className="rounded-lg border px-3 py-2 text-xs font-semibold capitalize text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {outcome}
                        </button>
                      ))}
                    </div>
                    {evidence ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Latest: {evidence.outcome} by {evidence.executedBy} on {new Date(evidence.executedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Release checklist</h2>
            <div className="mt-4 space-y-3">
              {report.checklist.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.description} Owner: {item.ownerRole}.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    {(["passed", "pending", "waived"] as GateStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={Boolean(working)}
                        onClick={() => action(`Checklist ${item.id}`, "/api/release/checklist", {
                          id: item.id,
                          status,
                          updatedBy: operator,
                        })}
                        className="rounded-md border px-2.5 py-1.5 text-xs font-semibold capitalize text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Release candidates</h2>
            {report.candidates.length ? (
              <div className="mt-4 space-y-2">
                {report.candidates.map((candidate) => (
                  <div key={candidate.id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-3 text-sm">
                    <span className="font-medium text-slate-900">{candidate.id} · v{candidate.version}</span>
                    <span className="text-slate-500">{candidate.buildSha} · {candidate.createdBy} · {new Date(candidate.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No release candidate has been created.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: GateStatus }): React.ReactElement {
  const classes =
    status === "passed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "failed"
        ? "bg-red-100 text-red-800"
        : status === "waived"
          ? "bg-blue-100 text-blue-800"
          : "bg-amber-100 text-amber-800";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>{status}</span>;
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
