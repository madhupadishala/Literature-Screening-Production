"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

type ReviewRecord = {
  workspaceId: string;
  packageId: string;
  packageKey: string;
  pmid: string;
  title: string;
  workflowState: string;
  workspaceStatus: string;
  patientSegmentationStatus: string;
  patientCount?: number;
  labelingStatus: string;
  causalityStatus: string;
  mrReviewStatus: string;
  products: string[];
  clinicalEvents: string[];
  screeningDecision: string;
  screeningReviewedAt?: string;
  screeningReviewedBy?: string;
};

function list(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function statusClass(value: string): string {
  const normalized = value.toUpperCase();
  if (["COMPLETE", "APPROVED"].includes(normalized)) return "ok";
  if (["NOT_CONFIGURED", "UNRESOLVED", "REVIEW_REQUIRED", "BLOCKED"].includes(normalized)) {
    return "warn";
  }
  return "pending";
}

export default function ReviewPage() {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<ReviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/literature/review?limit=500", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Review worklist.");
      }
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const metrics = useMemo(
    () => ({
      ready: records.filter((record) => record.workspaceStatus === "READY").length,
      segmentation: records.filter(
        (record) => record.patientSegmentationStatus !== "COMPLETE",
      ).length,
      labeling: records.filter((record) => record.labelingStatus !== "COMPLETE").length,
      causality: records.filter((record) => record.causalityStatus !== "COMPLETE").length,
      mr: records.filter((record) => record.mrReviewStatus !== "APPROVED").length,
    }),
    [records],
  );

  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="POST-SCREENING GOVERNED REVIEW"
        title="Review & Medical Review Workspace"
        subtitle="Case-level review begins only after an approved Screening INCLUDE. Patient segmentation, labeling / expectedness, causality and Medical Reviewer decisions are controlled separately from article-level Screening."
        status="Architecture boundary active"
      />

      <section className="boundary-note">
        <strong>Review boundary</strong>
        <span>
          Screening approval does not create an Intake output. Review / MR must be completed first.
        </span>
      </section>

      <section className="metrics">
        <Metric label="Ready for Review" value={metrics.ready} />
        <Metric label="Patient Segmentation Pending" value={metrics.segmentation} />
        <Metric label="Labeling Pending / Unconfigured" value={metrics.labeling} />
        <Metric label="Causality Pending / Unconfigured" value={metrics.causality} />
        <Metric label="MR Review Pending" value={metrics.mr} />
      </section>

      <section className="panel">
        <header>
          <div>
            <span>Governed worklist</span>
            <h2>Post-Screening Review</h2>
            <p>
              One literature article may contain zero, one or multiple reportable patients.
              Patient-level assessment starts here, not in Hits or Screening.
            </p>
          </div>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </header>

        {message && <div className="message">{message}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PMID</th>
                <th>Article</th>
                <th>Products</th>
                <th>Events</th>
                <th>Patient Segmentation</th>
                <th>Labeling</th>
                <th>Causality</th>
                <th>MR Review</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.workspaceId}>
                  <td>{record.pmid}</td>
                  <td>
                    <strong>{record.title}</strong>
                    <small>{record.packageKey}</small>
                  </td>
                  <td>{list(record.products)}</td>
                  <td>{list(record.clinicalEvents)}</td>
                  <td>
                    <Status value={record.patientSegmentationStatus} />
                  </td>
                  <td>
                    <Status value={record.labelingStatus} />
                  </td>
                  <td>
                    <Status value={record.causalityStatus} />
                  </td>
                  <td>
                    <Status value={record.mrReviewStatus} />
                  </td>
                  <td>
                    <button type="button" onClick={() => setSelected(record)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    No Screening-approved INCLUDE article is ready for Review.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div className="drawer-backdrop">
          <aside className="drawer" aria-label="Medical Review workspace">
            <header className="drawer-header">
              <div>
                <span>Review / MR workspace</span>
                <h2>{selected.title}</h2>
                <p>PMID {selected.pmid} · {selected.workflowState}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </header>

            <section className="step">
              <span>1 · Patient / Case Segmentation</span>
              <h3>{selected.patientSegmentationStatus}</h3>
              <p>
                The reviewer must determine whether the article contains zero, one or multiple
                potentially reportable patients before product-event assessment is finalized.
              </p>
            </section>

            <section className="step">
              <span>2 · Labeling / Expectedness</span>
              <h3>{selected.labelingStatus}</h3>
              <p>
                Expectedness is case-product-event specific. The engine must use an approved,
                effective Label / RSI reference for the applicable product, country and date.
                No label reference means no invented EXPECTED or UNEXPECTED conclusion.
              </p>
            </section>

            <section className="step">
              <span>3 · Causality</span>
              <h3>{selected.causalityStatus}</h3>
              <p>
                Causality is case-product-event specific. AI may extract chronology,
                dechallenge / rechallenge and alternative causes, but the final assessment
                requires the approved client causality method and governed reviewer oversight.
              </p>
            </section>

            <section className="step">
              <span>4 · Medical Reviewer Decision</span>
              <h3>{selected.mrReviewStatus}</h3>
              <p>
                MR finalization remains blocked until the required case segmentation,
                labeling and causality evidence is complete or explicitly governed as unresolved.
              </p>
            </section>

            <div className="gate">
              Intake generation is intentionally unavailable from this workspace until the
              complete Review / MR workflow and configuration gates are implemented.
            </div>
          </aside>
        </div>
      )}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          background: #eef2f7;
          color: #0f172a;
          font-family: "Poppins", Arial, sans-serif;
        }
        .boundary-note {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
          padding: 13px 16px;
          border: 1px solid #bae6fd;
          border-radius: 12px;
          background: #f0f9ff;
          color: #075985;
          font-size: 11px;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .panel {
          overflow: hidden;
          border: 1px solid #dbe4ef;
          border-radius: 16px;
          background: #fff;
        }
        .panel > header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 18px 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .panel > header span {
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .panel h2 {
          margin: 5px 0;
          font-size: 20px;
        }
        .panel p {
          margin: 0;
          color: #64748b;
          font-size: 11px;
        }
        button {
          border: 0;
          border-radius: 8px;
          padding: 8px 11px;
          background: #185abd;
          color: #fff;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }
        th, td {
          padding: 11px 10px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          vertical-align: top;
        }
        th {
          background: #f8fafc;
          color: #475569;
          font-size: 8px;
          text-transform: uppercase;
        }
        td strong, td small {
          display: block;
        }
        td small {
          margin-top: 3px;
          color: #94a3b8;
        }
        .message {
          margin: 12px 16px;
          padding: 10px 12px;
          border-radius: 8px;
          background: #fff7ed;
          color: #9a3412;
          font-size: 10px;
        }
        .empty {
          padding: 28px;
          text-align: center;
          color: #64748b;
        }
        .drawer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 90;
          display: flex;
          justify-content: flex-end;
          background: rgba(15, 23, 42, 0.45);
        }
        .drawer {
          width: min(760px, 96vw);
          height: 100%;
          overflow-y: auto;
          background: #f8fafc;
          box-shadow: -20px 0 60px rgba(15, 23, 42, 0.25);
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 22px;
          color: #fff;
          background: linear-gradient(135deg, #0f172a, #1d4ed8);
        }
        .drawer-header span {
          color: #7dd3fc;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .drawer-header h2 {
          margin: 6px 0;
          font-size: 22px;
        }
        .drawer-header p {
          margin: 0;
          color: #dbeafe;
          font-size: 11px;
        }
        .drawer-header button {
          width: 38px;
          height: 38px;
          padding: 0;
          background: rgba(255,255,255,.12);
          font-size: 22px;
        }
        .step {
          margin: 14px 18px 0;
          padding: 16px;
          border: 1px solid #dbe4ef;
          border-radius: 12px;
          background: #fff;
        }
        .step span {
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .step h3 {
          margin: 6px 0;
          font-size: 15px;
        }
        .step p {
          margin: 0;
          color: #64748b;
          font-size: 11px;
          line-height: 1.6;
        }
        .gate {
          margin: 14px 18px 22px;
          padding: 13px 15px;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          background: #fff7ed;
          color: #9a3412;
          font-size: 11px;
          font-weight: 700;
        }
        @media (max-width: 980px) {
          .metrics {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 700px) {
          .app-shell { padding: 12px; }
          .metrics { grid-template-columns: 1fr; }
          .boundary-note { flex-direction: column; }
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .metric {
          padding: 13px 14px;
          border: 1px solid #dbe4ef;
          border-radius: 12px;
          background: #fff;
        }
        span {
          display: block;
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }
        strong {
          display: block;
          margin-top: 5px;
          font-size: 22px;
        }
      `}</style>
    </article>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status ${statusClass(value)}`}>
      {value.replaceAll("_", " ")}
      <style jsx>{`
        .status {
          display: inline-block;
          padding: 4px 7px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .ok { color: #166534; background: #dcfce7; }
        .warn { color: #92400e; background: #fef3c7; }
        .pending { color: #1e40af; background: #dbeafe; }
      `}</style>
    </span>
  );
}
