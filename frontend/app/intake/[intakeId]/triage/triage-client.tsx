"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./triage.module.css";

type CriterionStatus = "MET" | "MISSING" | "UNRESOLVED";
type Validity = "VALID" | "INVALID" | "UNRESOLVED";
type Seriousness = "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type Criterion = {
  key: string;
  status: CriterionStatus;
  evidence: string[];
  reason: string;
};

type SystemSnapshot = {
  criteria: Criterion[];
  validityRecommendation: "VALID" | "UNRESOLVED";
  seriousnessRecommendation: Seriousness;
  seriousnessEvidence: Record<string, string[]>;
  detectedSpecialSituations: string[];
  followUpRecommended: boolean;
  followUpReasons: string[];
  priorityRecommendation: Priority;
};

type TriageWorkspace = {
  systemSnapshot: SystemSnapshot;
  latestAssessment: Record<string, unknown> | null;
};

type IntakeWorkspace = {
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
};

const SERIOUSNESS = [
  "DEATH",
  "LIFE_THREATENING",
  "HOSPITALIZATION_OR_PROLONGATION",
  "DISABILITY_OR_INCAPACITY",
  "CONGENITAL_ANOMALY_OR_BIRTH_DEFECT",
  "IMPORTANT_MEDICAL_EVENT",
] as const;

const SPECIAL = [
  "PREGNANCY",
  "BREASTFEEDING",
  "PEDIATRIC",
  "ELDERLY",
  "OVERDOSE",
  "OFF_LABEL_USE",
  "MISUSE",
  "ABUSE",
  "MEDICATION_ERROR",
  "OCCUPATIONAL_EXPOSURE",
  "LACK_OF_THERAPEUTIC_EFFICACY",
  "FALSIFIED_MEDICINAL_PRODUCT",
] as const;

function pretty(value: string): string {
  return value.replaceAll("_", " ");
}

function display(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export default function TriageClient({ intakeId }: { intakeId: string }) {
  const [workspace, setWorkspace] = useState<TriageWorkspace | null>(null);
  const [intake, setIntake] = useState<IntakeWorkspace | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [validity, setValidity] = useState<Validity>("UNRESOLVED");
  const [seriousness, setSeriousness] =
    useState<Seriousness>("UNRESOLVED");
  const [seriousnessCriteria, setSeriousnessCriteria] = useState<
    Record<string, boolean>
  >({});
  const [specialSituations, setSpecialSituations] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpReasons, setFollowUpReasons] = useState("");
  const [rationale, setRationale] = useState(
    "Processor completed formal ICSR validity and triage assessment.",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const initialize = useCallback((snapshot: SystemSnapshot) => {
    setCriteria(
      snapshot.criteria.map((item) => ({
        ...item,
        evidence: [...(item.evidence ?? [])],
      })),
    );
    setValidity(snapshot.validityRecommendation);
    setSeriousness(snapshot.seriousnessRecommendation);
    setSeriousnessCriteria(
      Object.fromEntries(
        SERIOUSNESS.map((key) => [
          key,
          Array.isArray(snapshot.seriousnessEvidence?.[key]) &&
            snapshot.seriousnessEvidence[key].length > 0,
        ]),
      ),
    );
    setSpecialSituations([...snapshot.detectedSpecialSituations]);
    setPriority(snapshot.priorityRecommendation);
    setFollowUpRequired(snapshot.followUpRecommended);
    setFollowUpReasons(snapshot.followUpReasons.join("\n"));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [triageResponse, intakeResponse] = await Promise.all([
        fetch(`/api/safety/intake/${intakeId}/triage`, { cache: "no-store" }),
        fetch(`/api/safety/intake/${intakeId}`, { cache: "no-store" }),
      ]);
      const [triagePayload, intakePayload] = await Promise.all([
        triageResponse.json(),
        intakeResponse.json(),
      ]);

      if (!triageResponse.ok || !triagePayload?.success) {
        throw new Error(triagePayload?.error || "Unable to load triage workspace.");
      }
      if (!intakeResponse.ok || !intakePayload?.success) {
        throw new Error(intakePayload?.error || "Unable to load Intake workspace.");
      }

      const triageData = triagePayload.data as TriageWorkspace;
      setWorkspace(triageData);
      setIntake(intakePayload.data as IntakeWorkspace);
      initialize(triageData.systemSnapshot);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load triage workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, [intakeId, initialize]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const allCriteriaMet = criteria.every((item) => item.status === "MET");
  const sourceVerified =
    display(intake?.intake.source_review_status) === "VERIFIED";

  const derivedOutcome = useMemo(() => {
    if (validity === "VALID") return "READY_FOR_DUPLICATE_REVIEW";
    if (validity === "INVALID") return "NOT_VALID_ICSR";
    if (followUpRequired) return "FOLLOW_UP_REQUIRED";
    return "HOLD_FOR_CLARIFICATION";
  }, [validity, followUpRequired]);

  function updateCriterion(
    key: string,
    patch: Partial<Pick<Criterion, "status" | "reason">>,
  ) {
    setCriteria((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function toggleSpecial(value: string) {
    setSpecialSituations((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function finalize() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/triage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: {
              minimumCriteria: criteria,
              humanValidityDecision: validity,
              seriousnessStatus: seriousness,
              seriousnessCriteria,
              specialSituations,
              priority,
              followUpRequired,
              followUpReasons: followUpReasons
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
              rationale,
            },
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to finalize triage.");
      }
      const updated = payload.data as TriageWorkspace;
      setWorkspace(updated);
      initialize(updated.systemSnapshot);
      setMessage(
        "Triage assessment finalized. The next routing state has been recorded and audited.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to finalize triage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>Nexus Intake · Sprint 5</span>
          <h1>ICSR Validity & Triage</h1>
          <p>
            System recommendations are assistive. The processor confirms the four
            minimum criteria, seriousness, special situations, priority and follow-up
            before finalizing the triage record.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/intake">Back to Intake</Link>
          <button type="button" onClick={() => void load()} disabled={loading}>
            Refresh evidence
          </button>
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.summary}>
        <Summary label="Intake" value={display(intake?.intake.intake_key)} />
        <Summary
          label="Source Review"
          value={display(intake?.intake.source_review_status)}
        />
        <Summary
          label="System validity"
          value={workspace?.systemSnapshot.validityRecommendation ?? "—"}
        />
        <Summary
          label="System seriousness"
          value={workspace?.systemSnapshot.seriousnessRecommendation ?? "—"}
        />
        <Summary label="Derived next state" value={derivedOutcome} />
      </section>

      {!sourceVerified ? (
        <div className={styles.blocker}>
          Source Review must be <strong>VERIFIED</strong> before formal triage can
          be finalized.
        </div>
      ) : null}

      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Minimum validation</span>
              <h2>Four ICSR Criteria</h2>
            </div>
            <span
              className={allCriteriaMet ? styles.goodBadge : styles.warnBadge}
            >
              {allCriteriaMet ? "4 / 4 met" : "Review required"}
            </span>
          </div>

          <div className={styles.criteria}>
            {criteria.map((item) => (
              <article key={item.key} className={styles.criterion}>
                <div className={styles.criterionTop}>
                  <strong>{pretty(item.key)}</strong>
                  <select
                    value={item.status}
                    onChange={(event) =>
                      updateCriterion(item.key, {
                        status: event.target.value as CriterionStatus,
                      })
                    }
                  >
                    <option value="MET">Met</option>
                    <option value="MISSING">Missing</option>
                    <option value="UNRESOLVED">Unresolved</option>
                  </select>
                </div>
                <ul>
                  {(item.evidence ?? []).map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                  {!item.evidence?.length ? <li>No system evidence found.</li> : null}
                </ul>
                <textarea
                  value={item.reason}
                  onChange={(event) =>
                    updateCriterion(item.key, { reason: event.target.value })
                  }
                  aria-label={`Reason for ${pretty(item.key)}`}
                />
              </article>
            ))}
          </div>

          <label className={styles.field}>
            <span>Human validity decision</span>
            <select
              value={validity}
              onChange={(event) => setValidity(event.target.value as Validity)}
            >
              <option value="VALID">Valid ICSR</option>
              <option value="UNRESOLVED">Unresolved / incomplete</option>
              <option value="INVALID">Not valid ICSR</option>
            </select>
          </label>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Clinical consequence</span>
              <h2>Seriousness</h2>
            </div>
            <span className={styles.systemNote}>
              System: {workspace?.systemSnapshot.seriousnessRecommendation ?? "—"}
            </span>
          </div>

          <label className={styles.field}>
            <span>Case seriousness</span>
            <select
              value={seriousness}
              onChange={(event) =>
                setSeriousness(event.target.value as Seriousness)
              }
            >
              <option value="SERIOUS">Serious</option>
              <option value="NON_SERIOUS">Non-serious</option>
              <option value="UNRESOLVED">Unresolved</option>
            </select>
          </label>

          <div className={styles.checks}>
            {SERIOUSNESS.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={seriousnessCriteria[item] === true}
                  onChange={(event) =>
                    setSeriousnessCriteria((current) => ({
                      ...current,
                      [item]: event.target.checked,
                    }))
                  }
                />
                <span>{pretty(item)}</span>
                {workspace?.systemSnapshot.seriousnessEvidence?.[item]?.length ? (
                  <small>
                    {workspace.systemSnapshot.seriousnessEvidence[item].join("; ")}
                  </small>
                ) : null}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>PV context</span>
              <h2>Special Situations</h2>
            </div>
          </div>
          <div className={styles.checks}>
            {SPECIAL.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={specialSituations.includes(item)}
                  onChange={() => toggleSpecial(item)}
                />
                <span>{pretty(item)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Operational routing</span>
              <h2>Priority & Follow-up</h2>
            </div>
          </div>

          <label className={styles.field}>
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={followUpRequired}
              onChange={(event) => setFollowUpRequired(event.target.checked)}
            />
            <span>Follow-up required</span>
          </label>

          <label className={styles.field}>
            <span>Follow-up reasons · one per line</span>
            <textarea
              value={followUpReasons}
              onChange={(event) => setFollowUpReasons(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Final triage rationale</span>
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>

          <div className={styles.outcome}>
            <span>System-derived next state</span>
            <strong>{pretty(derivedOutcome)}</strong>
          </div>

          <button
            type="button"
            className={styles.finalize}
            onClick={() => void finalize()}
            disabled={busy || loading || !sourceVerified}
          >
            {busy ? "Finalizing…" : "Finalize triage assessment"}
          </button>
        </div>
      </section>

      {workspace?.latestAssessment ? (
        <section className={styles.history}>
          <span className={styles.kicker}>Immutable history</span>
          <h2>Latest Finalized Assessment</h2>
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
