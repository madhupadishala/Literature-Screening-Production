"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./disposition.module.css";

type DispositionType =
  | "CREATE_NEXUS_CASE"
  | "EXPORT_EXTERNAL"
  | "FOLLOW_UP_EXISTING_CASE"
  | "DUPLICATE"
  | "INCOMPLETE_FOLLOW_UP"
  | "NON_CASE"
  | "HOLD";

type Workspace = {
  intake: Record<string, unknown>;
  caseProcessingEnabled: boolean;
  allowedDispositions: DispositionType[];
  latestDisposition: {
    id: string;
    dispositionVersion: number;
    dispositionType: DispositionType;
    targetCaseId: string | null;
    targetIntakeRecordId: string | null;
    externalSystem: string | null;
    externalCaseReference: string | null;
    externalHandoffPackageId: string | null;
    rationale: string;
    disposedAt: string;
  } | null;
  latestHandoff: {
    id: string;
    destinationSystem: string;
    packageFormat: string;
    packageVersion: number;
    payloadSha256: string;
    status: string;
    preparedAt: string;
    downloadedAt: string | null;
  } | null;
  createdCase: {
    caseId: string;
    caseKey: string;
    caseStatus: string;
  } | null;
};

const LABELS: Record<DispositionType, string> = {
  CREATE_NEXUS_CASE: "Create Nexus Case",
  EXPORT_EXTERNAL: "Export to External Safety System",
  FOLLOW_UP_EXISTING_CASE: "Follow-up Existing Case",
  DUPLICATE: "Confirmed Duplicate",
  INCOMPLETE_FOLLOW_UP: "Incomplete / Follow-up Required",
  NON_CASE: "Non-case",
  HOLD: "Hold",
};

const HELP: Record<DispositionType, string> = {
  CREATE_NEXUS_CASE:
    "Create a new governed Nexus safety case. Available only when Case Processing is licensed.",
  EXPORT_EXTERNAL:
    "Prepare a hash-locked Nexus Safety JSON package for manual/import handoff to another safety database.",
  FOLLOW_UP_EXISTING_CASE:
    "Route this Intake as new information for the case selected during duplicate/follow-up review.",
  DUPLICATE:
    "Close this Intake as a confirmed duplicate of the matched case/report.",
  INCOMPLETE_FOLLOW_UP:
    "Keep the Intake on hold while due-diligence follow-up is obtained.",
  NON_CASE:
    "Close a formally invalid report as non-case with an auditable rationale.",
  HOLD:
    "Place the Intake on governed hold without making a final safety-case disposition.",
};

function display(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function pretty(value: string): string {
  return value.replaceAll("_", " ");
}

export default function DispositionClient({
  intakeId,
}: {
  intakeId: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selected, setSelected] = useState<DispositionType | "">("");
  const [rationale, setRationale] = useState(
    "Processor completed governed Intake disposition after triage and duplicate review.",
  );
  const [destinationSystem, setDestinationSystem] = useState("");
  const [externalCaseReference, setExternalCaseReference] = useState("");
  const [caseKey, setCaseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/disposition`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load disposition workspace.");
      }
      const data = payload.data as Workspace;
      setWorkspace(data);
      if (!data.latestDisposition && data.allowedDispositions.length === 1) {
        setSelected(data.allowedDispositions[0]);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load disposition workspace.",
      );
    }
  }, [intakeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const complete =
    display(workspace?.intake.disposition_status, "NOT_STARTED") === "COMPLETE";
  const selectedAllowed =
    selected !== "" && workspace?.allowedDispositions.includes(selected);

  const readiness = useMemo(() => {
    if (!selected) return "";
    if (selected === "EXPORT_EXTERNAL" && !destinationSystem.trim()) {
      return "Enter the destination safety system.";
    }
    if (
      selected === "FOLLOW_UP_EXISTING_CASE" &&
      !display(workspace?.intake.matched_case_id, "") &&
      !display(workspace?.intake.matched_intake_record_id, "") &&
      !externalCaseReference.trim() &&
      !display(workspace?.intake.matched_external_reference, "")
    ) {
      return "A matched Nexus case/intake or external case reference is required.";
    }
    if (rationale.trim().length < 10) {
      return "Disposition rationale must contain at least 10 characters.";
    }
    return "";
  }, [
    selected,
    destinationSystem,
    rationale,
    externalCaseReference,
    workspace,
  ]);

  async function finalize() {
    if (!selected || !selectedAllowed || readiness) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/disposition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dispositionType: selected,
            rationale,
            destinationSystem: destinationSystem || undefined,
            externalCaseReference: externalCaseReference || undefined,
            caseKey: caseKey || undefined,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to finalize disposition.");
      }
      setWorkspace(payload.data as Workspace);
      setMessage("Intake disposition finalized and audit trail updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to finalize disposition.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>Nexus Intake · Sprint 7</span>
          <h1>Intake Disposition</h1>
          <p>
            Final routing is constrained by validity, duplicate/follow-up review and
            tenant entitlements. External export creates a governed handoff package;
            it does not claim direct Argus/Veeva transmission.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/intake">Back to Intake</Link>
          <Link href={`/intake/${intakeId}/duplicate-review`}>
            Duplicate Review
          </Link>
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.summary}>
        <Summary label="Intake" value={display(workspace?.intake.intake_key)} />
        <Summary
          label="Validity"
          value={display(workspace?.intake.validity_status)}
        />
        <Summary
          label="Relationship"
          value={display(workspace?.intake.case_relationship)}
        />
        <Summary
          label="Duplicate Review"
          value={display(workspace?.intake.duplicate_review_status)}
        />
        <Summary
          label="Case Processing"
          value={workspace?.caseProcessingEnabled ? "ENABLED" : "NOT LICENSED"}
        />
      </section>

      <section className={styles.options}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>Allowed by current state</span>
            <h2>Disposition Options</h2>
          </div>
          <span>{workspace?.allowedDispositions.length ?? 0} available</span>
        </div>

        <div className={styles.optionGrid}>
          {(Object.keys(LABELS) as DispositionType[]).map((type) => {
            const allowed = workspace?.allowedDispositions.includes(type) ?? false;
            return (
              <button
                key={type}
                type="button"
                className={`${styles.option} ${
                  selected === type ? styles.selected : ""
                }`}
                disabled={!allowed || complete}
                onClick={() => setSelected(type)}
              >
                <strong>{LABELS[type]}</strong>
                <span>{HELP[type]}</span>
                {!allowed ? <small>Not allowed in current state</small> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.formPanel}>
        <div>
          <span className={styles.kicker}>Controlled final action</span>
          <h2>{selected ? LABELS[selected] : "Select a disposition"}</h2>
        </div>

        {selected === "EXPORT_EXTERNAL" ? (
          <label>
            <span>Destination safety system</span>
            <input
              value={destinationSystem}
              onChange={(event) => setDestinationSystem(event.target.value)}
              placeholder="Example: Argus Safety / Veeva Vault Safety"
              disabled={complete}
            />
          </label>
        ) : null}

        {selected === "FOLLOW_UP_EXISTING_CASE" ? (
          <label>
            <span>External case reference · optional when Nexus match exists</span>
            <input
              value={externalCaseReference}
              onChange={(event) => setExternalCaseReference(event.target.value)}
              placeholder={display(
                workspace?.intake.matched_external_reference,
                "External case ID",
              )}
              disabled={complete}
            />
          </label>
        ) : null}

        {selected === "CREATE_NEXUS_CASE" ? (
          <label>
            <span>Case key · optional</span>
            <input
              value={caseKey}
              onChange={(event) => setCaseKey(event.target.value)}
              placeholder="Leave blank for Nexus-generated case key"
              disabled={complete}
            />
          </label>
        ) : null}

        <label>
          <span>Disposition rationale</span>
          <textarea
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            disabled={complete}
          />
        </label>

        {readiness ? <div className={styles.warning}>{readiness}</div> : null}

        <button
          type="button"
          className={styles.finalize}
          onClick={() => void finalize()}
          disabled={
            busy ||
            complete ||
            !selected ||
            !selectedAllowed ||
            Boolean(readiness)
          }
        >
          {busy ? "Finalizing…" : "Finalize disposition"}
        </button>
      </section>

      {workspace?.latestDisposition ? (
        <section className={styles.result}>
          <span className={styles.kicker}>Finalized disposition</span>
          <h2>{LABELS[workspace.latestDisposition.dispositionType]}</h2>

          {workspace.createdCase ? (
            <div className={styles.successBox}>
              <span>Nexus case created</span>
              <strong>{workspace.createdCase.caseKey}</strong>
              <small>{workspace.createdCase.caseStatus}</small>
            </div>
          ) : null}

          {workspace.latestHandoff ? (
            <div className={styles.handoff}>
              <div>
                <span>External handoff prepared</span>
                <strong>{workspace.latestHandoff.destinationSystem}</strong>
                <small>
                  SHA-256: {workspace.latestHandoff.payloadSha256}
                </small>
              </div>
              <a
                href={`/api/safety/intake/${intakeId}/handoffs/${workspace.latestHandoff.id}`}
              >
                Download governed JSON
              </a>
            </div>
          ) : null}

          <pre>{JSON.stringify(workspace.latestDisposition, null, 2)}</pre>
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
