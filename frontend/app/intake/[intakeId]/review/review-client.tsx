"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Workspace = {
  intake: {
    id: string;
    intakeKey: string;
    status: string;
    priority: string;
    seriousnessStatus: string;
    validityStatus: string;
    triageStatus: string;
    triageOutcome: string | null;
    caseRelationship: string | null;
  };
  assessment: {
    id: string;
    assessmentVersion: number;
    humanValidityDecision: string;
    seriousnessStatus: string;
    priority: string;
    followUpRequired: boolean;
    triageOutcome: string;
    rationale: string;
    assessedAt: string;
  } | null;
  reviewType: "QC" | "MEDICAL_REVIEW";
  task: {
    id: string;
    status: string;
    assignedTo: string | null;
    dueAt: string | null;
    outcome: Record<string, unknown>;
    updatedAt: string;
  } | null;
  history: Array<{
    eventType: string;
    outcome: string;
    details: Record<string, unknown>;
    occurredAt: string;
  }>;
};

function human(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export default function IntakeLifecycleReviewClient() {
  const params = useParams<{ intakeId: string }>();
  const searchParams = useSearchParams();
  const intakeId = params.intakeId;
  const reviewType = searchParams.get("stage")?.toLowerCase() === "mr" ? "MEDICAL_REVIEW" : "QC";
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [rationale, setRationale] = useState(
    reviewType === "QC"
      ? "QC review completed against the current triage assessment and source evidence."
      : "Medical Review completed against the current triage assessment and source evidence.",
  );
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/lifecycle-review?reviewType=${reviewType}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Intake review workspace.");
      }
      setWorkspace(payload.data as Workspace);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake review workspace.");
    }
  }, [intakeId, reviewType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: "APPROVE" | "RETURN") {
    if (rationale.trim().length < 10) {
      setMessage("Review rationale must contain at least 10 characters.");
      return;
    }
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/intake/${intakeId}/lifecycle-review?reviewType=${reviewType}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, rationale }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Review action failed.");
      }
      setWorkspace(payload.data as Workspace);
      setMessage(
        action === "APPROVE"
          ? reviewType === "QC"
            ? "QC approved. The record is now routed to Medical Review."
            : "Medical Review approved. The record is now ready for disposition."
          : "Record returned to triage for controlled rework.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setBusy("");
    }
  }

  const title = reviewType === "QC" ? "Intake QC Review" : "Intake Medical Review";
  const activeTask = workspace?.task && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(workspace.task.status);

  return (
    <>
      <section className="ir-header">
        <div>
          <span>Intake & Triage · {reviewType === "QC" ? "QC" : "Medical Review"}</span>
          <h1>{title}</h1>
          <p>Review the current controlled triage assessment. Approval is bound to this exact assessment version.</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </section>

      {message ? <div className="ir-message">{message}</div> : null}

      {!workspace ? (
        <section className="ir-panel ir-empty">Loading review workspace…</section>
      ) : (
        <>
          <section className="ir-strip">
            <Info label="Intake" value={workspace.intake.intakeKey} />
            <Info label="Relationship" value={human(workspace.intake.caseRelationship)} />
            <Info label="Validity" value={human(workspace.intake.validityStatus)} />
            <Info label="Seriousness" value={human(workspace.intake.seriousnessStatus)} />
            <Info label="Priority" value={human(workspace.intake.priority)} />
            <Info label="Assessment" value={workspace.assessment ? `v${workspace.assessment.assessmentVersion}` : "—"} />
          </section>

          <section className="ir-grid">
            <div className="ir-panel">
              <div className="ir-panel-head">
                <div>
                  <span>Controlled assessment</span>
                  <h2>Triage Decision</h2>
                </div>
                <span className="ir-status">{human(workspace.task?.status || "NO_TASK")}</span>
              </div>

              {workspace.assessment ? (
                <dl className="ir-details">
                  <div><dt>Assessment version</dt><dd>v{workspace.assessment.assessmentVersion}</dd></div>
                  <div><dt>Validity decision</dt><dd>{human(workspace.assessment.humanValidityDecision)}</dd></div>
                  <div><dt>Seriousness</dt><dd>{human(workspace.assessment.seriousnessStatus)}</dd></div>
                  <div><dt>Priority</dt><dd>{human(workspace.assessment.priority)}</dd></div>
                  <div><dt>Follow-up required</dt><dd>{workspace.assessment.followUpRequired ? "Yes" : "No"}</dd></div>
                  <div><dt>Triage outcome</dt><dd>{human(workspace.assessment.triageOutcome)}</dd></div>
                  <div className="wide"><dt>Rationale</dt><dd>{workspace.assessment.rationale}</dd></div>
                  <div className="wide"><dt>Assessed</dt><dd>{new Date(workspace.assessment.assessedAt).toLocaleString()}</dd></div>
                </dl>
              ) : (
                <div className="ir-empty">No triage assessment is available.</div>
              )}
            </div>

            <aside className="ir-panel ir-review">
              <div className="ir-panel-head">
                <div>
                  <span>Human review</span>
                  <h2>{reviewType === "QC" ? "QC Decision" : "Medical Decision"}</h2>
                </div>
              </div>
              <label className="ir-label">
                <span>Review rationale</span>
                <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} />
              </label>
              <div className="ir-actions">
                <button
                  type="button"
                  className="return"
                  onClick={() => void act("RETURN")}
                  disabled={busy !== "" || !activeTask}
                >
                  {busy === "RETURN" ? "Returning…" : "Return to Triage"}
                </button>
                <button
                  type="button"
                  className="approve"
                  onClick={() => void act("APPROVE")}
                  disabled={busy !== "" || !activeTask}
                >
                  {busy === "APPROVE" ? "Approving…" : reviewType === "QC" ? "Approve QC" : "Approve Medical Review"}
                </button>
              </div>

              {!activeTask ? (
                <div className="ir-next">
                  {reviewType === "QC" && workspace.task?.status === "COMPLETED" ? (
                    <Link href="/intake/mr-queue">Open MR Queue</Link>
                  ) : reviewType === "MEDICAL_REVIEW" && workspace.intake.status === "READY_FOR_DISPOSITION" ? (
                    <Link href={`/intake/${intakeId}/disposition`}>Open Disposition</Link>
                  ) : workspace.intake.triageStatus === "IN_PROGRESS" ? (
                    <Link href={`/intake/${intakeId}/triage`}>Open Triage Rework</Link>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </section>

          <section className="ir-panel ir-history">
            <div className="ir-panel-head"><div><span>Audit history</span><h2>Lifecycle Review Actions</h2></div></div>
            {workspace.history.length ? (
              <table>
                <thead><tr><th>Time</th><th>Review</th><th>Outcome</th><th>Action</th><th>Assessment</th><th>Rationale</th></tr></thead>
                <tbody>
                  {workspace.history.map((event, index) => (
                    <tr key={`${event.occurredAt}-${index}`}>
                      <td>{new Date(event.occurredAt).toLocaleString()}</td>
                      <td>{human(String(event.details.reviewType || event.eventType))}</td>
                      <td>{human(event.outcome)}</td>
                      <td>{human(String(event.details.action || "—"))}</td>
                      <td>{event.details.assessmentVersion ? `v${String(event.details.assessmentVersion)}` : "—"}</td>
                      <td>{String(event.details.rationale || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="ir-empty">No prior QC/MR actions for this Intake record.</div>}
          </section>
        </>
      )}

      <style jsx>{`
        .ir-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:4px 2px 14px}.ir-header span{color:#0f6db7;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ir-header h1{margin:3px 0 0;color:#102a43;font-size:25px;letter-spacing:-.035em}.ir-header p{margin:6px 0 0;color:#64748b;font-size:11px}.ir-header button{height:33px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:9px;font-weight:800;cursor:pointer}.ir-message{margin-bottom:10px;padding:9px 11px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;color:#1e3a8a;font-size:10px}.ir-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:12px;border:1px solid #dce4ed;border-radius:8px;background:#fff;overflow:hidden}.ir-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(340px,.7fr);gap:12px;margin-bottom:12px}.ir-panel{border:1px solid #dce4ed;border-radius:8px;background:#fff;overflow:hidden}.ir-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #e7edf3;background:#fbfcfe}.ir-panel-head span{color:#718096;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.ir-panel-head h2{margin:3px 0 0;color:#102a43;font-size:16px}.ir-status{display:inline-flex!important;padding:5px 7px;border-radius:4px;background:#eef2f6;color:#475569!important}.ir-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0;padding:8px 14px 14px}.ir-details div{padding:10px 0;border-bottom:1px solid #edf1f5}.ir-details div:nth-child(odd){padding-right:16px}.ir-details .wide{grid-column:1/-1;padding-right:0}.ir-details dt{color:#718096;font-size:8px;font-weight:800;text-transform:uppercase}.ir-details dd{margin:4px 0 0;color:#334155;font-size:10px;line-height:1.45}.ir-review{align-self:start}.ir-label{display:grid;gap:6px;padding:14px}.ir-label span{color:#526579;font-size:9px;font-weight:800}.ir-label textarea{min-height:130px;resize:vertical;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:10px;line-height:1.5}.ir-actions{display:flex;gap:8px;padding:0 14px 14px}.ir-actions button{flex:1;min-height:35px;border-radius:6px;font-size:9px;font-weight:900;cursor:pointer}.ir-actions button:disabled{opacity:.45;cursor:not-allowed}.ir-actions .return{border:1px solid #f2b8b5;background:#fff5f5;color:#b42318}.ir-actions .approve{border:1px solid #0f6db7;background:#0f6db7;color:#fff}.ir-next{padding:0 14px 14px}.ir-next a{display:flex;justify-content:center;padding:9px;border:1px solid #b8d7f4;border-radius:6px;background:#f0f7ff;color:#0f5fa8;text-decoration:none;font-size:9px;font-weight:900}.ir-history table{width:100%;border-collapse:collapse;font-size:9px}.ir-history th{padding:8px 10px;background:#f5f7fa;color:#526579;text-align:left;font-size:8px;text-transform:uppercase}.ir-history td{padding:9px 10px;border-top:1px solid #edf1f5;color:#334155}.ir-empty{padding:30px;color:#718096;text-align:center;font-size:10px}@media(max-width:950px){.ir-grid{grid-template-columns:1fr}.ir-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.ir-header{align-items:flex-start;flex-direction:column}.ir-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.ir-details{grid-template-columns:1fr}.ir-details .wide{grid-column:auto}.ir-history{overflow:auto}.ir-history table{min-width:760px}}
      `}</style>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="ir-info">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .ir-info{display:grid;gap:3px;padding:9px 11px;border-right:1px solid #edf1f5}.ir-info:last-child{border-right:0}.ir-info span{color:#718096;font-size:8px;font-weight:800;text-transform:uppercase}.ir-info strong{color:#172b4d;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      `}</style>
    </div>
  );
}
