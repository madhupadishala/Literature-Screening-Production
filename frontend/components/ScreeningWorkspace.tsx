"use client";

import { useState } from "react";

type ScreeningArticle = {
  product_name: string;
  pmid: string;
  confidence_score: number;
  qc_required: boolean;
  journal: string;
  publication_date: string;
  country_of_interest: string;
  primary_author: string;
  hits_status: string;
  screening_status: string;
  evidence_sentence: string;
  company_suspect_drugs: string[];
  active_mah: string;
  co_suspect_drugs: string[];
  concomitant_medications: string[];
  treatment_medications: string[];
  clinical_events: string[];
  special_situations: string[];
  event_severity: string;
  seriousness: string;
  patient_safety: string;
  patient_identification_pii: string;
  coi: string;
  screening_decision: string;
  screening_reasoning: string;
  flags: string[];
  audit_trail: Array<{
    timestamp: string;
    action: string;
    reason: string;
    performedBy: string;
  }>;
};

type Props = {
  article: ScreeningArticle;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
  onApprove: (reason: string) => void;
  onExclude: (reason: string) => void;
  onSave: (reason: string) => void;
  onRerunAI: (reason: string) => void;
};

const tabs = [
  "Overview",
  "Product Assessment",
  "Safety Assessment",
  "Regulatory Assessment",
  "AI Assessment",
  "Flags",
  "Audit",
];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function list(value?: string[]) {
  return value?.length ? value.join(", ") : "—";
}

function clean(value?: string | null) {
  return value || "—";
}

export default function ScreeningWorkspace({
  article,
  activeTab,
  setActiveTab,
  onClose,
  onApprove,
  onExclude,
  onSave,
  onRerunAI,
}: Props) {
  const [modal, setModal] = useState<null | {
    title: string;
    action: "approve" | "exclude" | "save" | "rerun";
  }>(null);

  function submitReason(reason: string) {
    if (!modal) return;

    if (modal.action === "approve") onApprove(reason);
    if (modal.action === "exclude") onExclude(reason);
    if (modal.action === "save") onSave(reason);
    if (modal.action === "rerun") onRerunAI(reason);

    setModal(null);
  }

  return (
    <div className="drawer-backdrop" role="presentation">
      <aside className="review-drawer" aria-label="Screening review workspace">
        <header className="drawer-header">
          <div>
            <span className="eyebrow">Human-governed screening review</span>
            <h2>{article.product_name}</h2>
            <p>
              PMID {article.pmid} · AI confidence {percent(article.confidence_score)}
            </p>
          </div>

          <button type="button" className="close" onClick={onClose} aria-label="Close review">
            ×
          </button>
        </header>

        <div className="boundary-note">
          Approval generates the governed downstream file <strong>intake_input.json</strong>.
          No Intake workspace exists inside Literature Intelligence.
        </div>

        <nav className="tabs" aria-label="Screening review sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className="drawer-body">
          {activeTab === "Overview" && (
            <Section title="Review Overview">
              <Row label="QC Requirement" value={article.qc_required ? "Required" : "Not required"} />
              <Row label="Journal" value={article.journal} />
              <Row label="Publication Date" value={article.publication_date} />
              <Row label="Country of Interest" value={article.country_of_interest} />
              <Row label="Primary Reporter" value={article.primary_author} />
              <Row label="Hits Status" value={article.hits_status} />
              <Row label="Screening Status" value={article.screening_status} />
              <div className="evidence">
                <span>Evidence sentence</span>
                <p>{clean(article.evidence_sentence)}</p>
              </div>
            </Section>
          )}

          {activeTab === "Product Assessment" && (
            <Section title="Product Assessment">
              <Row label="Detected Product" value={article.product_name} />
              <Row label="Company Suspect Drugs" value={list(article.company_suspect_drugs)} />
              <Row label="Active MAH" value={article.active_mah} />
              <Row label="Co-suspect Drugs" value={list(article.co_suspect_drugs)} />
              <Row
                label="Concomitant Medications"
                value={list(article.concomitant_medications)}
              />
              <Row label="Treatment Medications" value={list(article.treatment_medications)} />
              <p className="support-note">
                Product identity, company-suspect status and active MAH are assessed here.
                Dose, indication, action taken and detailed chronology belong to downstream
                case processing.
              </p>
            </Section>
          )}

          {activeTab === "Safety Assessment" && (
            <Section title="Safety Assessment">
              <Row label="Clinical Events" value={list(article.clinical_events)} />
              <Row label="Special Situations" value={list(article.special_situations)} />
              <Row label="Event Severity" value={article.event_severity} />
              <Row label="Seriousness" value={article.seriousness} />
              <Row label="Patient Safety Information" value={article.patient_safety} />
              <Row label="Patient Identification / PII" value={article.patient_identification_pii} />
            </Section>
          )}

          {activeTab === "Regulatory Assessment" && (
            <Section title="Regulatory Assessment">
              <Row label="Country of Interest" value={article.country_of_interest} />
              <Row label="COI Assessment" value={article.coi} />
              <Row label="Active MAH" value={article.active_mah} />
              <Row label="Screening Decision" value={article.screening_decision} />
              <p className="support-note">
                Literature Intelligence records the evidence and screening decision.
                Booking and downstream case review occur outside this workspace.
              </p>
            </Section>
          )}

          {activeTab === "AI Assessment" && (
            <Section title="AI Assessment">
              <Row label="Confidence" value={percent(article.confidence_score)} />
              <Row label="Decision" value={article.screening_decision} />
              <div className="evidence">
                <span>Reasoning</span>
                <p>{clean(article.screening_reasoning)}</p>
              </div>
              <div className="evidence">
                <span>Evidence</span>
                <p>{clean(article.evidence_sentence)}</p>
              </div>
            </Section>
          )}

          {activeTab === "Flags" && (
            <Section title="Flags">
              <div className="flag-list">
                {article.flags.length > 0 ? (
                  article.flags.map((flag) => <span key={flag}>{flag}</span>)
                ) : (
                  <p>No active flags.</p>
                )}
              </div>
            </Section>
          )}

          {activeTab === "Audit" && (
            <Section title="Audit Trail">
              <div className="audit-list">
                {article.audit_trail.length > 0 ? (
                  article.audit_trail.map((event, index) => (
                    <article key={`${event.timestamp}-${index}`}>
                      <strong>{event.action}</strong>
                      <span>{event.timestamp}</span>
                      <p>{event.reason}</p>
                      <small>{event.performedBy}</small>
                    </article>
                  ))
                ) : (
                  <p>No manual review events recorded.</p>
                )}
              </div>
            </Section>
          )}
        </div>

        <footer className="actions">
          <button
            type="button"
            onClick={() =>
              setModal({
                title: "Reason required to exclude this screening result",
                action: "exclude",
              })
            }
          >
            Exclude
          </button>

          <button
            type="button"
            onClick={() =>
              setModal({
                title: "Reason required to save this screening review",
                action: "save",
              })
            }
          >
            Save Review
          </button>

          <button
            type="button"
            onClick={() =>
              setModal({
                title: "Reason required to re-run Screening AI",
                action: "rerun",
              })
            }
          >
            Re-run AI
          </button>

          <button
            type="button"
            className="primary-action"
            onClick={() =>
              setModal({
                title: "Reason required to generate the downstream output",
                action: "approve",
              })
            }
          >
            Generate Downstream Output
          </button>
        </footer>

        {modal && (
          <ReasonModal
            title={modal.title}
            onCancel={() => setModal(null)}
            onSubmit={submitReason}
          />
        )}
      </aside>

      <style jsx>{`
        .drawer-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          justify-content: flex-end;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(3px);
        }

        .review-drawer {
          display: flex;
          width: min(820px, 95vw);
          height: 100%;
          flex-direction: column;
          color: #0f172a;
          background: #f8fafc;
          box-shadow: -24px 0 70px rgba(15, 23, 42, 0.24);
          font-family: "Poppins", Arial, sans-serif;
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 24px 26px;
          color: #ffffff;
          background:
            radial-gradient(circle at 90% 0%, rgba(56, 189, 248, 0.22), transparent 30%),
            linear-gradient(135deg, #0f172a, #1d4ed8);
        }

        .eyebrow {
          color: #7dd3fc;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.065em;
          text-transform: uppercase;
        }

        h2 {
          margin: 6px 0;
          font-size: 25px;
        }

        .drawer-header p {
          margin: 0;
          color: #dbeafe;
          font-size: 12px;
        }

        .close {
          display: grid;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          font-size: 24px;
          cursor: pointer;
        }

        .boundary-note {
          padding: 11px 26px;
          border-bottom: 1px solid #bae6fd;
          color: #075985;
          background: #f0f9ff;
          font-size: 11px;
          line-height: 1.5;
        }

        .tabs {
          display: flex;
          gap: 7px;
          padding: 10px 18px;
          overflow-x: auto;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }

        .tabs button {
          border: 0;
          border-radius: 9px;
          padding: 9px 11px;
          color: #475569;
          background: transparent;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
        }

        .tabs button.active {
          color: #ffffff;
          background: #1d4ed8;
        }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px 22px 120px;
        }

        .actions {
          position: sticky;
          bottom: 0;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 14px 18px;
          border-top: 1px solid #dbe4ef;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 -10px 25px rgba(15, 23, 42, 0.06);
        }

        .actions button {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px 12px;
          color: #334155;
          background: #ffffff;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .actions .primary-action {
          border-color: #1d4ed8;
          color: #ffffff;
          background: #1d4ed8;
        }

        @media (max-width: 680px) {
          .actions {
            flex-wrap: wrap;
          }

          .actions button {
            flex: 1 1 45%;
          }
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="review-section">
      <h3>{title}</h3>
      <div className="rows">{children}</div>

      <style jsx>{`
        .review-section {
          padding: 20px;
          border: 1px solid #e2e8f0;
          border-radius: 17px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
        }

        h3 {
          margin: 0 0 16px;
          font-size: 17px;
          letter-spacing: -0.015em;
        }

        .rows {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        :global(.evidence),
        :global(.support-note),
        :global(.flag-list),
        :global(.audit-list) {
          grid-column: 1 / -1;
        }

        :global(.evidence) {
          padding: 14px;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background: #f8fbff;
        }

        :global(.evidence span) {
          display: block;
          margin-bottom: 6px;
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        :global(.evidence p),
        :global(.support-note) {
          margin: 0;
          color: #475569;
          font-size: 12px;
          line-height: 1.65;
        }

        :global(.support-note) {
          padding: 13px;
          border-left: 3px solid #38bdf8;
          background: #f0f9ff;
        }

        :global(.flag-list) {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        :global(.flag-list span) {
          padding: 7px 9px;
          border: 1px solid #fde68a;
          border-radius: 999px;
          color: #92400e;
          background: #fffbeb;
          font-size: 10px;
          font-weight: 800;
        }

        :global(.audit-list) {
          display: grid;
          gap: 10px;
        }

        :global(.audit-list article) {
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
        }

        :global(.audit-list strong),
        :global(.audit-list span),
        :global(.audit-list small) {
          display: block;
        }

        :global(.audit-list span),
        :global(.audit-list small) {
          color: #64748b;
          font-size: 10px;
        }

        :global(.audit-list p) {
          margin: 7px 0;
          font-size: 11px;
        }

        @media (max-width: 620px) {
          .rows {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{clean(value)}</strong>

      <style jsx>{`
        .detail-row {
          min-height: 72px;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #fbfdff;
        }

        span {
          display: block;
          margin-bottom: 6px;
          color: #64748b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.045em;
          text-transform: uppercase;
        }

        strong {
          display: block;
          color: #0f172a;
          font-size: 11px;
          line-height: 1.5;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

function ReasonModal({
  title,
  onCancel,
  onSubmit,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 10;

  return (
    <div className="modal-backdrop">
      <div className="reason-modal">
        <span>GxP-controlled action</span>
        <h3>{title}</h3>
        <p>The reason is mandatory and will be captured in the audit trail.</p>

        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Enter a clear, reviewable business reason."
          autoFocus
        />

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-action"
            disabled={!valid}
            onClick={() => onSubmit(reason)}
          >
            Confirm Action
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.58);
        }

        .reason-modal {
          width: min(500px, 100%);
          padding: 24px;
          border-radius: 19px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
        }

        .reason-modal > span {
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        h3 {
          margin: 8px 0;
          font-size: 19px;
        }

        p {
          margin: 0 0 14px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.6;
        }

        textarea {
          width: 100%;
          min-height: 118px;
          resize: vertical;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          outline: none;
          font: inherit;
          font-size: 12px;
          box-sizing: border-box;
        }

        textarea:focus {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.1);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 14px;
        }

        button {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px 13px;
          background: #ffffff;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .primary-action {
          border-color: #1d4ed8;
          color: #ffffff;
          background: #1d4ed8;
        }

        .primary-action:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
      `}</style>
    </div>
  );
}
