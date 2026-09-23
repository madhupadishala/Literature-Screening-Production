"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./duplicate-review.module.css";

type Candidate = {
  id: string;
  candidateIntakeRecordId: string;
  candidateCaseId: string | null;
  candidateReference: string;
  score: number;
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  matchedFactors: Array<{ key?: unknown; weight?: unknown; evidence?: unknown }>;
  candidateSnapshot: {
    intakeKey?: string;
    caseKey?: string | null;
    externalReference?: string | null;
    countryCode?: string | null;
    products?: Array<{ reportedName?: string }>;
    events?: Array<{ reportedTerm?: string }>;
    patients?: Array<{
      patientReference?: string | null;
      sex?: string | null;
      ageValue?: number | null;
      ageUnit?: string | null;
    }>;
  };
  rank: number;
  humanCandidateDecision: string;
};

type Workspace = {
  source: {
    intakeRecordId: string;
    intakeKey: string;
    caseId?: string | null;
    caseKey?: string | null;
    externalReference?: string | null;
    countryCode?: string | null;
    products: Array<{ reportedName: string }>;
    events: Array<{ reportedTerm: string }>;
  };
  latestRun: {
    id: string;
    runNumber: number;
    candidateCount: number;
    status: string;
  } | null;
  candidates: Candidate[];
  latestAssessment: {
    id: string;
    assessmentVersion: number;
    systemRecommendation: string;
    topCandidateScore: number | null;
    humanDecision: string;
    selectedCandidateId: string | null;
    selectedCandidateCaseId?: string | null;
    selectedCandidateIntakeRecordId?: string | null;
    rationale: string;
    assessedAt: string;
  } | null;
};

function pretty(value: string): string {
  return value.replaceAll("_", " ");
}

function display(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function candidateSummary(candidate: Candidate): string {
  const products = candidate.candidateSnapshot.products
    ?.map((item) => item.reportedName)
    .filter(Boolean)
    .join(", ");
  const events = candidate.candidateSnapshot.events
    ?.map((item) => item.reportedTerm)
    .filter(Boolean)
    .join(", ");
  return [products, events].filter(Boolean).join(" · ") || "No summary available";
}

export default function DuplicateReviewClient({ intakeId }: { intakeId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [reason, setReason] = useState(
    "Processor reviewed duplicate and follow-up candidate evidence.",
  );
  const [decision, setDecision] = useState<
    "NEW_CASE" | "FOLLOW_UP" | "DUPLICATE" | "NOT_MATCH"
  >("NEW_CASE");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(`/api/safety/intake/${intakeId}/duplicate-review`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load duplicate review.");
      }
      setWorkspace(payload.data as Workspace);
      const selected = payload.data?.latestAssessment?.selectedCandidateId;
      if (typeof selected === "string") setSelectedCandidateId(selected);
      const finalDecision = payload.data?.latestAssessment?.humanDecision;
      if (["NEW_CASE", "FOLLOW_UP", "DUPLICATE", "NOT_MATCH"].includes(finalDecision)) {
        setDecision(finalDecision);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load duplicate review.");
    }
  }, [intakeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function runSearch() {
    setBusy("search");
    setMessage("");
    try {
      const response = await fetch(`/api/safety/intake/${intakeId}/duplicate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Duplicate search failed.");
      }
      setWorkspace(payload.data as Workspace);
      setDecision(payload.data?.candidates?.length ? "NOT_MATCH" : "NEW_CASE");
      setSelectedCandidateId("");
      setMessage("Duplicate search completed. A human relationship decision is required before triage.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Duplicate search failed.");
    } finally {
      setBusy("");
    }
  }

  async function finalize() {
    setBusy("finalize");
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/duplicate-review/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            humanDecision: decision,
            selectedCandidateId: selectedCandidateId || null,
            rationale: reason,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to finalize duplicate review.");
      }
      setWorkspace(payload.data as Workspace);
      setMessage(
        decision === "DUPLICATE"
          ? "Duplicate confirmed. The record will not enter triage and can be closed through duplicate disposition."
          : decision === "FOLLOW_UP"
            ? "Follow-up confirmed and linked to the existing case. The new follow-up now enters Intake & Triage."
            : "Duplicate gate cleared. The record is now ready for formal ICSR triage.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to finalize duplicate review.");
    } finally {
      setBusy("");
    }
  }

  const complete = Boolean(workspace?.latestAssessment);
  const finalDecision = workspace?.latestAssessment?.humanDecision;
  const requiresCandidate = decision === "FOLLOW_UP" || decision === "DUPLICATE";

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>Intake & Triage · Entry Gate</span>
          <h1>Duplicate & Follow-up Check</h1>
          <p>
            Every verified incoming report is checked before formal triage. Nexus ranks
            possible matches using explainable patient, product, event, source-ID and
            date factors; the human reviewer makes the final relationship decision.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/intake/duplicate-check">Back to Duplicate Queue</Link>
          {complete && finalDecision === "DUPLICATE" ? (
            <Link href={`/intake/${intakeId}/disposition`}>Close Duplicate</Link>
          ) : null}
          {complete && finalDecision !== "DUPLICATE" ? (
            <Link href={`/intake/${intakeId}/triage`}>Open ICSR Triage</Link>
          ) : null}
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.summary}>
        <Summary label="Intake" value={workspace?.source.intakeKey ?? "—"} />
        <Summary
          label="Search run"
          value={workspace?.latestRun ? `Run ${workspace.latestRun.runNumber}` : "Not run"}
        />
        <Summary label="Candidates" value={String(workspace?.candidates.length ?? 0)} />
        <Summary label="Gate decision" value={finalDecision ?? "Pending"} />
      </section>

      <section className={styles.controls}>
        <label>
          <span>Audit rationale</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={() => void runSearch()} disabled={busy !== "" || complete}>
          {busy === "search" ? "Searching…" : "Run duplicate search"}
        </button>
      </section>

      <section className={styles.candidates}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>Ranked evidence</span>
            <h2>Potential Matches</h2>
          </div>
          <span>
            {workspace?.latestAssessment?.systemRecommendation ??
              (workspace?.candidates.length ? "REVIEW REQUIRED" : "NO SEARCH")}
          </span>
        </div>

        <div className={styles.grid}>
          {workspace?.candidates.map((candidate) => (
            <article
              key={candidate.id}
              className={`${styles.card} ${
                selectedCandidateId === candidate.id ? styles.selected : ""
              }`}
            >
              <div className={styles.cardTop}>
                <div>
                  <span>Rank {candidate.rank}</span>
                  <strong>{candidate.candidateReference}</strong>
                  <small>{candidateSummary(candidate)}</small>
                </div>
                <div className={styles.score}>
                  <strong>{Math.round(candidate.score)}%</strong>
                  <span>{candidate.confidenceBand}</span>
                </div>
              </div>

              <dl>
                <div>
                  <dt>Existing case</dt>
                  <dd>{display(candidate.candidateSnapshot.caseKey)}</dd>
                </div>
                <div>
                  <dt>External ref</dt>
                  <dd>{display(candidate.candidateSnapshot.externalReference)}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{display(candidate.candidateSnapshot.countryCode)}</dd>
                </div>
              </dl>

              <div className={styles.factors}>
                {candidate.matchedFactors.map((factor, index) => (
                  <div key={`${candidate.id}-factor-${index}`}>
                    <strong>+{display(factor.weight, "0")}</strong>
                    <span>{display(factor.evidence)}</span>
                  </div>
                ))}
              </div>

              <label className={styles.selectCandidate}>
                <input
                  type="radio"
                  name="candidate"
                  checked={selectedCandidateId === candidate.id}
                  onChange={() => setSelectedCandidateId(candidate.id)}
                  disabled={complete}
                />
                <span>
                  Select this candidate
                  {candidate.candidateCaseId ? " · existing case available" : ""}
                </span>
              </label>
            </article>
          ))}

          {workspace?.latestRun && workspace.candidates.length === 0 ? (
            <div className={styles.empty}>No candidate met the configured duplicate-review threshold.</div>
          ) : null}
        </div>
      </section>

      <section className={styles.finalPanel}>
        <div>
          <span className={styles.kicker}>Human authority</span>
          <h2>Final Relationship Decision</h2>
          <p>
            A FOLLOW-UP must link to an existing case. A confirmed DUPLICATE stops here
            and does not enter triage. NEW CASE and NOT MATCH continue into the Intake
            & Triage lifecycle.
          </p>
        </div>

        <label>
          <span>Decision</span>
          <select
            value={decision}
            onChange={(event) =>
              setDecision(
                event.target.value as "NEW_CASE" | "FOLLOW_UP" | "DUPLICATE" | "NOT_MATCH",
              )
            }
            disabled={complete}
          >
            <option value="NEW_CASE">New Case</option>
            <option value="FOLLOW_UP">Follow-up</option>
            <option value="DUPLICATE">Duplicate</option>
            <option value="NOT_MATCH">Not Match</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => void finalize()}
          disabled={
            busy !== "" || complete || !workspace?.latestRun || (requiresCandidate && !selectedCandidateId)
          }
        >
          {busy === "finalize" ? "Finalizing…" : "Finalize duplicate gate"}
        </button>
      </section>

      {workspace?.latestAssessment ? (
        <section className={styles.history}>
          <span className={styles.kicker}>Immutable decision</span>
          <h2>Finalized Gate Assessment</h2>
          <pre>{JSON.stringify(workspace.latestAssessment, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{pretty(value)}</strong>
    </div>
  );
}
