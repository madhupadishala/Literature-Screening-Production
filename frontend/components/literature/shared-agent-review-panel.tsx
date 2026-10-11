"use client";

import { useRef, useState } from "react";
import { PV_AGENT_NAMES, type SharedPVAgentName, type SharedPVAgentSuggestion } from "@/lib/literature/shared-agents/shared-agent-contract";

type SuggestionEnvelope = {
  success: true;
  status: "SUGGESTION_ONLY";
  reviewRequired: true;
  data: SharedPVAgentSuggestion;
};

const LABELS: Record<SharedPVAgentName, string> = {
  "drug-role": "Drug role",
  seriousness: "Seriousness",
  causality: "Causality",
  "specialist-icsr": "Specialist ICSR",
};

/** Independent, human-initiated read-only panel; never writes clinical decisions. */
export function SharedAgentReviewPanel({ reviewWorkspaceId }: { reviewWorkspaceId: string }) {
  const [agent, setAgent] = useState<SharedPVAgentName>("seriousness");
  const [suggestion, setSuggestion] = useState<SharedPVAgentSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  async function assess() {
    if (loading || !reviewWorkspaceId) return;
    const activeGeneration = ++generation.current;
    setSuggestion(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/literature/review/shared-agent", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewWorkspaceId, agent }),
      });
      if (!response.ok) throw new Error("Agent suggestion unavailable");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") throw new Error("Invalid response");
      const envelope = payload as Partial<SuggestionEnvelope>;
      if (envelope.success !== true || envelope.status !== "SUGGESTION_ONLY" ||
          envelope.reviewRequired !== true || !envelope.data ||
          envelope.data.agent !== agent || envelope.data.route !== "hitl" ||
          envelope.data.review_required !== true ||
          !Array.isArray(envelope.data.evidence_spans) ||
          typeof envelope.data.knowledge_version !== "string" ||
          typeof envelope.data.audit_id !== "string") {
        throw new Error("Invalid suggestion governance");
      }
      if (activeGeneration === generation.current) setSuggestion(envelope.data);
    } catch {
      if (activeGeneration === generation.current) setError("No verified specialist suggestion is available. Continue with the existing medical review workflow.");
    } finally {
      if (activeGeneration === generation.current) setLoading(false);
    }
  }

  return (
    <section aria-label="Shared PV specialist suggestions" className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">Shared PV specialist suggestions</h3>
      <p className="text-sm">Advisory only. Specialist output is not a verified clinical fact and cannot approve, reject, or transfer a case.</p>
      <label className="block text-sm" htmlFor="shared-pv-agent">Specialist</label>
      <select id="shared-pv-agent" value={agent} onChange={(e) => {
          generation.current += 1;
          setAgent(e.target.value as SharedPVAgentName);
          setSuggestion(null);
          setError(null);
          setLoading(false);
        }}
        disabled={loading} className="rounded border p-2">
        {PV_AGENT_NAMES.map((name) => <option key={name} value={name}>{LABELS[name]}</option>)}
      </select>
      <button type="button" onClick={() => void assess()} disabled={loading || !reviewWorkspaceId}
        className="rounded border px-3 py-2 disabled:opacity-50">
        {loading ? "Requesting suggestion…" : "Request specialist suggestion"}
      </button>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {suggestion && <div aria-live="polite" className="space-y-2 text-sm">
        <p><strong>Human review required</strong> — confidence {(suggestion.confidence * 100).toFixed(1)}% (not a clinical accuracy score)</p>
        <p>Knowledge version: {suggestion.knowledge_version}</p>
        <p>Audit reference: {suggestion.audit_id}</p>
        <h4 className="font-semibold">Source-grounded excerpts</h4>
        {suggestion.evidence_spans.length ? (
          <ul className="list-disc pl-5">{suggestion.evidence_spans.map((span, index) =>
            <li key={index}><q>{span.text}</q> (offsets {span.start}–{span.end})</li>)}</ul>
        ) : <p>No source excerpts returned. Do not adopt an unsupported clinical conclusion.</p>}
        <h4 className="font-semibold">Structured proposal (unverified)</h4>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border p-2">
          {JSON.stringify(suggestion.result, null, 2)}
        </pre>
        <p>This panel does not save or incorporate results. Apply existing controlled Medical Review procedures independently.</p>
      </div>}
    </section>
  );
}
