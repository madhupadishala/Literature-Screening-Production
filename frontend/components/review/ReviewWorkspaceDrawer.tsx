"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CausalityAssessmentInput,
  LabelAssessmentInput,
  PatientSegment,
  ReviewWorkspaceDetail,
} from "@/lib/literature/review/review-types";

type Props = {
  workspaceId: string;
  onClose: () => void;
  onUpdated: () => void;
};

function pairKey(segmentKey: string, product: string, event: string): string {
  return [segmentKey, product, event].map((value) => value.toLowerCase()).join("|");
}

function requiredPairs(segments: PatientSegment[]) {
  const seen = new Set<string>();
  const pairs: Array<{ segmentKey: string; product: string; event: string; evidence: string }> = [];
  for (const segment of segments) {
    for (const relation of segment.relationships) {
      if (relation.role === "CONCOMITANT") continue;
      const key = pairKey(segment.segmentKey, relation.product, relation.event);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        segmentKey: segment.segmentKey,
        product: relation.product,
        event: relation.event,
        evidence: relation.evidence,
      });
    }
  }
  return pairs;
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-status">
      <span>{label}</span>
      <strong>{value.replaceAll("_", " ")}</strong>
    </div>
  );
}

function AssessmentSummary({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; primary: string; secondary: string }>;
}) {
  if (!rows.length) return null;
  return (
    <div className="assessment-summary">
      <strong>{title}</strong>
      {rows.map((row) => (
        <div key={row.key}>
          <span>{row.primary}</span>
          <small>{row.secondary}</small>
        </div>
      ))}
    </div>
  );
}

export default function ReviewWorkspaceDrawer({ workspaceId, onClose, onUpdated }: Props) {
  const [detail, setDetail] = useState<ReviewWorkspaceDetail | null>(null);
  const [segments, setSegments] = useState<PatientSegment[]>([]);
  const [segReason, setSegReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [labelPair, setLabelPair] = useState("");
  const [labelConclusion, setLabelConclusion] =
    useState<LabelAssessmentInput["conclusion"]>("UNRESOLVED");
  const [labelKey, setLabelKey] = useState("");
  const [labelVersion, setLabelVersion] = useState("");
  const [labelDate, setLabelDate] = useState("");
  const [labelRationale, setLabelRationale] = useState("");
  const [causalityPair, setCausalityPair] = useState("");
  const [causalityConclusion, setCausalityConclusion] = useState("UNRESOLVED");
  const [causalityMethod, setCausalityMethod] = useState("");
  const [causalityVersion, setCausalityVersion] = useState("");
  const [causalityRationale, setCausalityRationale] = useState("");
  const [mrComments, setMrComments] = useState("");
  const [ackUnresolved, setAckUnresolved] = useState(false);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const response = await fetch("/api/literature/review/" + workspaceId, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Review workspace.");
      }
      const next = payload.data as ReviewWorkspaceDetail;
      setDetail(next);
      setSegments(next.patientSegments || []);
      setMrComments(next.medicalReview?.comments || "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pairs = useMemo(() => requiredPairs(segments), [segments]);

  async function post(path: string, body: unknown, key: string) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Review action failed.");
      }
      const next = payload.data as ReviewWorkspaceDetail;
      setDetail(next);
      setSegments(next.patientSegments || []);
      setMessage("Saved successfully.");
      onUpdated();
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy("");
    }
  }

  function addPatient() {
    const n = segments.length + 1;
    setSegments((current) => [
      ...current,
      {
        segmentKey: "PATIENT-" + n,
        patientDescriptor: "Patient " + n,
        identifiablePatient: "UNRESOLVED",
        sex: "unknown",
        products: [],
        events: [],
        relationships: [],
        sourceEvidence: [],
      },
    ]);
  }

  function updateSegment(index: number, patch: Partial<PatientSegment>) {
    setSegments((current) =>
      current.map((segment, itemIndex) =>
        itemIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  }

  function addRelationship(index: number) {
    setSegments((current) =>
      current.map((segment, itemIndex) =>
        itemIndex === index
          ? {
              ...segment,
              relationships: [
                ...segment.relationships,
                { product: "", event: "", role: "UNKNOWN", evidence: "" },
              ],
            }
          : segment,
      ),
    );
  }

  function updateRelationship(
    segmentIndex: number,
    relationshipIndex: number,
    field: "product" | "event" | "role" | "evidence",
    value: string,
  ) {
    setSegments((current) =>
      current.map((segment, itemIndex) => {
        if (itemIndex !== segmentIndex) return segment;
        return {
          ...segment,
          relationships: segment.relationships.map((relation, relIndex) =>
            relIndex === relationshipIndex
              ? {
                  ...relation,
                  [field]:
                    field === "role"
                      ? (value as PatientSegment["relationships"][number]["role"])
                      : value,
                }
              : relation,
          ),
        };
      }),
    );
  }

  const effectiveLabelPair =
    labelPair ||
    (pairs[0] ? pairKey(pairs[0].segmentKey, pairs[0].product, pairs[0].event) : "");
  const effectiveCausalityPair =
    causalityPair ||
    (pairs[0] ? pairKey(pairs[0].segmentKey, pairs[0].product, pairs[0].event) : "");
  const selectedLabelPair = pairs.find(
    (pair) => pairKey(pair.segmentKey, pair.product, pair.event) === effectiveLabelPair,
  );
  const selectedCausalityPair = pairs.find(
    (pair) => pairKey(pair.segmentKey, pair.product, pair.event) === effectiveCausalityPair,
  );

  if (!detail) {
    return (
      <div className="review-backdrop">
        <aside className="review-drawer review-loading">
          <button type="button" onClick={onClose}>Close</button>
          <p>{busy ? "Loading Review workspace…" : message}</p>
        </aside>
        <style jsx global>{reviewCss}</style>
      </div>
    );
  }

  const unresolved =
    detail.labelingStatus === "UNRESOLVED" ||
    detail.causalityStatus === "UNRESOLVED";

  return (
    <div className="review-backdrop">
      <aside className="review-drawer">
        <header className="review-hero">
          <div>
            <span>Patient-level Review / MR</span>
            <h2>{detail.title}</h2>
            <p>PMID {detail.pmid} · {detail.workflowState} · Screening v{detail.screening.resultVersion}</p>
          </div>
          <button className="review-close" type="button" onClick={onClose}>×</button>
        </header>

        <div className="review-status-grid">
          <Status label="Segmentation" value={detail.patientSegmentationStatus} />
          <Status label="Labeling" value={detail.labelingStatus} />
          <Status label="Causality" value={detail.causalityStatus} />
          <Status label="Medical Review" value={detail.mrReviewStatus} />
        </div>

        {message && <div className="review-message">{message}</div>}

        <section className="review-section">
          <div className="review-heading">
            <span>Source Evidence</span>
            <h3>Article & Screening Lineage</h3>
          </div>
          <div className="review-lineage">
            <p><b>Products:</b> {detail.screening.products.join(", ") || "—"}</p>
            <p><b>Events:</b> {detail.screening.events.join(", ") || "—"}</p>
            <p><b>Screening decision:</b> {detail.screening.decision}</p>
            <p><b>Screening reviewer:</b> {detail.screening.reviewedBy || "—"}</p>
          </div>
          <details>
            <summary>View source abstract</summary>
            <div className="review-abstract" dangerouslySetInnerHTML={{ __html: detail.abstract || "No abstract available." }} />
          </details>
        </section>

        <section className="review-section">
          <div className="review-heading">
            <span>Step 1</span>
            <h3>Patient / Case Segmentation</h3>
            <p>AI creates a draft only. Human confirmation is required before patient-level assessment.</p>
          </div>
          <div className="review-actions">
            <input
              value={segReason}
              onChange={(event) => setSegReason(event.target.value)}
              placeholder="Specific GxP reason for this action"
            />
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void post(
                  "/api/literature/review/" + workspaceId + "/segmentation/draft",
                  { reason: segReason },
                  "seg-ai",
                )
              }
            >
              {busy === "seg-ai" ? "Generating…" : "Generate AI Draft"}
            </button>
            <button type="button" className="review-secondary" onClick={addPatient}>+ Add Patient</button>
          </div>

          {segments.map((segment, segmentIndex) => (
            <article className="review-patient" key={segment.segmentKey + "-" + segmentIndex}>
              <div className="review-patient-head">
                <strong>{segment.segmentKey}</strong>
                <button
                  type="button"
                  className="review-danger"
                  onClick={() =>
                    setSegments((current) =>
                      current.filter((_, index) => index !== segmentIndex),
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <div className="review-grid">
                <label>
                  <span>Patient descriptor</span>
                  <input
                    value={segment.patientDescriptor}
                    onChange={(event) =>
                      updateSegment(segmentIndex, { patientDescriptor: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Identifiable patient</span>
                  <select
                    value={segment.identifiablePatient}
                    onChange={(event) =>
                      updateSegment(segmentIndex, {
                        identifiablePatient: event.target.value as PatientSegment["identifiablePatient"],
                      })
                    }
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="UNRESOLVED">Unresolved</option>
                  </select>
                </label>
                <label>
                  <span>Age</span>
                  <input
                    type="number"
                    min="0"
                    value={segment.age ?? ""}
                    onChange={(event) =>
                      updateSegment(segmentIndex, {
                        age: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                  />
                </label>
                <label>
                  <span>Sex</span>
                  <select
                    value={segment.sex || "unknown"}
                    onChange={(event) =>
                      updateSegment(segmentIndex, {
                        sex: event.target.value as PatientSegment["sex"],
                      })
                    }
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>

              <div className="review-subhead">
                <strong>Product–Event Relationships</strong>
                <button type="button" className="review-secondary" onClick={() => addRelationship(segmentIndex)}>
                  + Add
                </button>
              </div>
              {segment.relationships.map((relation, relationshipIndex) => (
                <div className="review-relationship" key={relationshipIndex}>
                  <input
                    value={relation.product}
                    placeholder="Product"
                    onChange={(event) =>
                      updateRelationship(segmentIndex, relationshipIndex, "product", event.target.value)
                    }
                  />
                  <input
                    value={relation.event}
                    placeholder="Event"
                    onChange={(event) =>
                      updateRelationship(segmentIndex, relationshipIndex, "event", event.target.value)
                    }
                  />
                  <select
                    value={relation.role}
                    onChange={(event) =>
                      updateRelationship(segmentIndex, relationshipIndex, "role", event.target.value)
                    }
                  >
                    <option value="SUSPECT">Suspect</option>
                    <option value="INTERACTING">Interacting</option>
                    <option value="CONCOMITANT">Concomitant</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                  <input
                    value={relation.evidence}
                    placeholder="Source evidence"
                    onChange={(event) =>
                      updateRelationship(segmentIndex, relationshipIndex, "evidence", event.target.value)
                    }
                  />
                </div>
              ))}
            </article>
          ))}
          {segments.length === 0 && <div className="review-empty">No patient segments currently defined.</div>}

          <div className="review-footer-actions">
            <button
              type="button"
              className="review-secondary"
              disabled={Boolean(busy)}
              onClick={() =>
                void post(
                  "/api/literature/review/" + workspaceId + "/segmentation",
                  {
                    patientSegments: segments,
                    complete: false,
                    reason: segReason,
                    expectedVersion: detail.workspaceVersion,
                  },
                  "seg-save",
                )
              }
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void post(
                  "/api/literature/review/" + workspaceId + "/segmentation",
                  {
                    patientSegments: segments,
                    complete: true,
                    reason: segReason,
                    expectedVersion: detail.workspaceVersion,
                  },
                  "seg-confirm",
                )
              }
            >
              Confirm Segmentation
            </button>
          </div>
        </section>

        <section className="review-section">
          <div className="review-heading">
            <span>Step 2</span>
            <h3>Labeling / Expectedness</h3>
            <p>EXPECTED or UNEXPECTED requires a controlled Label / RSI identifier, version and effective date.</p>
          </div>
          <label>
            <span>Patient / Product / Event</span>
            <select value={effectiveLabelPair} onChange={(event) => setLabelPair(event.target.value)}>
              {pairs.map((pair) => (
                <option
                  key={pairKey(pair.segmentKey, pair.product, pair.event)}
                  value={pairKey(pair.segmentKey, pair.product, pair.event)}
                >
                  {pair.segmentKey} · {pair.product} → {pair.event}
                </option>
              ))}
            </select>
          </label>
          <div className="review-grid">
            <label>
              <span>Expectedness</span>
              <select
                value={labelConclusion}
                onChange={(event) =>
                  setLabelConclusion(event.target.value as LabelAssessmentInput["conclusion"])
                }
              >
                <option value="UNRESOLVED">Unresolved</option>
                <option value="EXPECTED">Expected</option>
                <option value="UNEXPECTED">Unexpected</option>
              </select>
            </label>
            <label><span>Label / RSI Key</span><input value={labelKey} onChange={(event) => setLabelKey(event.target.value)} /></label>
            <label><span>Version</span><input value={labelVersion} onChange={(event) => setLabelVersion(event.target.value)} /></label>
            <label><span>Effective Date</span><input type="date" value={labelDate} onChange={(event) => setLabelDate(event.target.value)} /></label>
          </div>
          <textarea value={labelRationale} onChange={(event) => setLabelRationale(event.target.value)} placeholder="Expectedness rationale" />
          <button
            type="button"
            disabled={!selectedLabelPair || Boolean(busy)}
            onClick={() =>
              selectedLabelPair &&
              void post(
                "/api/literature/review/" + workspaceId + "/labeling",
                {
                  patientSegmentKey: selectedLabelPair.segmentKey,
                  reportedProduct: selectedLabelPair.product,
                  clinicalEvent: selectedLabelPair.event,
                  conclusion: labelConclusion,
                  referenceLabelKey: labelKey,
                  referenceLabelVersion: labelVersion,
                  referenceEffectiveDate: labelDate,
                  rationale: labelRationale,
                  evidence: { sourceEvidence: selectedLabelPair.evidence },
                } satisfies LabelAssessmentInput,
                "label",
              )
            }
          >
            Save Expectedness Assessment
          </button>
          <AssessmentSummary title="Saved expectedness assessments" rows={detail.labelAssessments.map((item) => ({
            key: item.id,
            primary: item.patientSegmentKey + " · " + item.reportedProduct + " → " + item.clinicalEvent,
            secondary: item.conclusion + (item.referenceLabelKey ? " · " + item.referenceLabelKey + " v" + (item.referenceLabelVersion || "") : ""),
          }))} />
        </section>

        <section className="review-section">
          <div className="review-heading">
            <span>Step 3</span>
            <h3>Causality</h3>
            <p>A definitive conclusion requires the approved client method and version. Otherwise keep it UNRESOLVED.</p>
          </div>
          <label>
            <span>Patient / Product / Event</span>
            <select value={effectiveCausalityPair} onChange={(event) => setCausalityPair(event.target.value)}>
              {pairs.map((pair) => (
                <option
                  key={pairKey(pair.segmentKey, pair.product, pair.event)}
                  value={pairKey(pair.segmentKey, pair.product, pair.event)}
                >
                  {pair.segmentKey} · {pair.product} → {pair.event}
                </option>
              ))}
            </select>
          </label>
          <div className="review-grid">
            <label><span>Conclusion</span><input value={causalityConclusion} onChange={(event) => setCausalityConclusion(event.target.value)} /></label>
            <label><span>Method Key</span><input value={causalityMethod} onChange={(event) => setCausalityMethod(event.target.value)} /></label>
            <label><span>Method Version</span><input value={causalityVersion} onChange={(event) => setCausalityVersion(event.target.value)} /></label>
          </div>
          <textarea value={causalityRationale} onChange={(event) => setCausalityRationale(event.target.value)} placeholder="Chronology, dechallenge/rechallenge, alternatives and rationale" />
          <button
            type="button"
            disabled={!selectedCausalityPair || Boolean(busy)}
            onClick={() =>
              selectedCausalityPair &&
              void post(
                "/api/literature/review/" + workspaceId + "/causality",
                {
                  patientSegmentKey: selectedCausalityPair.segmentKey,
                  reportedProduct: selectedCausalityPair.product,
                  clinicalEvent: selectedCausalityPair.event,
                  methodKey: causalityMethod,
                  methodVersion: causalityVersion,
                  conclusion: causalityConclusion,
                  rationale: causalityRationale,
                  evidence: { sourceEvidence: selectedCausalityPair.evidence },
                } satisfies CausalityAssessmentInput,
                "causality",
              )
            }
          >
            Save Causality Assessment
          </button>
          <AssessmentSummary title="Saved causality assessments" rows={detail.causalityAssessments.map((item) => ({
            key: item.id,
            primary: item.patientSegmentKey + " · " + item.reportedProduct + " → " + item.clinicalEvent,
            secondary: item.conclusion + (item.methodKey ? " · " + item.methodKey + " v" + (item.methodVersion || "") : ""),
          }))} />
        </section>

        <section className="review-section">
          <div className="review-heading">
            <span>Step 4</span>
            <h3>Medical Reviewer Decision</h3>
            <p>MR approval is the final Review gate before Intake eligibility.</p>
          </div>
          <textarea value={mrComments} onChange={(event) => setMrComments(event.target.value)} placeholder="Medical Reviewer rationale" />
          {unresolved && (
            <label className="review-ack">
              <input type="checkbox" checked={ackUnresolved} onChange={(event) => setAckUnresolved(event.target.checked)} />
              <span>I acknowledge unresolved expectedness and/or causality and have considered it in this Medical Review.</span>
            </label>
          )}
          <div className="review-footer-actions">
            <button type="button" className="review-danger" disabled={Boolean(busy)} onClick={() => void post(
              "/api/literature/review/" + workspaceId + "/medical-review",
              { decision: "EXCLUDE", comments: mrComments, unresolvedAcknowledged: ackUnresolved },
              "mr-exclude",
            )}>Exclude</button>
            <button type="button" className="review-secondary" disabled={Boolean(busy)} onClick={() => void post(
              "/api/literature/review/" + workspaceId + "/medical-review",
              { decision: "REVIEW_REQUIRED", comments: mrComments, unresolvedAcknowledged: ackUnresolved },
              "mr-review",
            )}>Keep in Review</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void post(
              "/api/literature/review/" + workspaceId + "/medical-review",
              { decision: "APPROVE_FOR_INTAKE", comments: mrComments, unresolvedAcknowledged: ackUnresolved },
              "mr-approve",
            )}>Approve for Intake</button>
          </div>
        </section>
      </aside>
      <style jsx global>{reviewCss}</style>
    </div>
  );
}

const reviewCss = `
  .review-backdrop { position:fixed; inset:0; z-index:100; display:flex; justify-content:flex-end; background:rgba(15,23,42,.48); }
  .review-drawer { width:min(980px,98vw); height:100%; overflow-y:auto; background:#f8fafc; box-shadow:-20px 0 60px rgba(15,23,42,.28); font-family:"Poppins",Arial,sans-serif; }
  .review-hero { position:sticky; top:0; z-index:4; display:flex; justify-content:space-between; gap:20px; padding:22px 24px; background:linear-gradient(135deg,#0f172a,#1d4ed8); color:white; }
  .review-hero span { color:#7dd3fc; font-size:9px; font-weight:900; text-transform:uppercase; }
  .review-hero h2 { margin:6px 0; font-size:20px; line-height:1.3; }
  .review-hero p { margin:0; color:#dbeafe; font-size:10px; }
  .review-close { width:38px; height:38px; padding:0; background:rgba(255,255,255,.12); font-size:22px; }
  .review-status-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; padding:12px 20px; border-bottom:1px solid #dbe4ef; background:white; }
  .review-status span { display:block; color:#64748b; font-size:8px; font-weight:900; text-transform:uppercase; }
  .review-status strong { display:inline-block; margin-top:4px; padding:4px 7px; border-radius:999px; background:#e0f2fe; color:#075985; font-size:8px; text-transform:uppercase; }
  .review-section { margin:14px 18px; padding:18px; border:1px solid #dbe4ef; border-radius:14px; background:white; }
  .review-heading > span { color:#1d4ed8; font-size:9px; font-weight:900; text-transform:uppercase; }
  .review-heading h3 { margin:5px 0; font-size:16px; }
  .review-heading p { margin:0 0 14px; color:#64748b; font-size:10px; line-height:1.6; }
  .review-lineage { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 16px; font-size:10px; }
  .review-lineage p { margin:0; }
  .review-section details { margin-top:10px; }
  .review-section summary { cursor:pointer; color:#1d4ed8; font-size:10px; font-weight:800; }
  .review-abstract { margin-top:10px; max-height:260px; overflow:auto; padding:12px; border-radius:10px; background:#f8fafc; color:#334155; font-size:10px; line-height:1.65; }
  .review-message { margin:12px 18px 0; padding:10px 12px; border:1px solid #bfdbfe; border-radius:9px; background:#eff6ff; color:#1e40af; font-size:10px; }
  .review-actions, .review-footer-actions, .review-patient-head, .review-subhead { display:flex; gap:8px; align-items:center; }
  .review-actions input { flex:1; }
  .review-footer-actions { justify-content:flex-end; margin-top:12px; }
  .review-patient-head, .review-subhead { justify-content:space-between; }
  .review-drawer button { border:0; border-radius:8px; padding:9px 11px; background:#185abd; color:white; font:inherit; font-size:9px; font-weight:800; cursor:pointer; }
  .review-drawer button.review-secondary { background:#e2e8f0; color:#0f172a; }
  .review-drawer button.review-danger { background:#fee2e2; color:#991b1b; }
  .review-drawer button:disabled { opacity:.55; cursor:not-allowed; }
  .review-drawer input, .review-drawer select, .review-drawer textarea { width:100%; box-sizing:border-box; border:1px solid #cbd5e1; border-radius:8px; padding:8px 9px; background:white; color:#0f172a; font:inherit; font-size:10px; }
  .review-drawer textarea { min-height:74px; margin:9px 0; resize:vertical; }
  .review-drawer label > span { display:block; margin:7px 0 4px; color:#64748b; font-size:8px; font-weight:900; text-transform:uppercase; }
  .review-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .review-patient { margin-top:10px; padding:13px; border:1px solid #e2e8f0; border-radius:11px; background:#fbfdff; }
  .review-subhead { margin-top:12px; padding-top:10px; border-top:1px dashed #cbd5e1; font-size:9px; }
  .review-relationship { display:grid; grid-template-columns:1fr 1fr 130px 1.5fr; gap:7px; margin-top:7px; }
  .review-empty, .review-loading { padding:24px; text-align:center; color:#64748b; font-size:10px; }
  .review-ack { display:flex; gap:8px; align-items:flex-start; margin-top:8px; padding:10px; border-radius:9px; background:#fff7ed; }
  .review-ack input { width:auto; margin-top:2px; }
  .review-ack span { margin:0; color:#9a3412; text-transform:none; }
  .assessment-summary { margin-top:12px; padding:10px; border-radius:9px; background:#f8fafc; }
  .assessment-summary > strong { display:block; margin-bottom:6px; font-size:9px; }
  .assessment-summary div { display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-top:1px solid #e2e8f0; font-size:9px; }
  .assessment-summary small { color:#64748b; }
  @media(max-width:800px) {
    .review-status-grid, .review-grid, .review-relationship, .review-lineage { grid-template-columns:1fr; }
    .review-actions, .review-footer-actions { flex-direction:column; align-items:stretch; }
  }
`;
