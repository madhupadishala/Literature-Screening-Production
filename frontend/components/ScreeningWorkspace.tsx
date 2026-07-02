"use client";

import { useState } from "react";
import type { ScreeningArticle } from "../app/screening/page";

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

function list(value: string[]) {
  return value.length ? value.join(", ") : "—";
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
    <aside className="review-workspace">
      <div className="review-top">
        <div>
          <p className="eyebrow">Screening Workspace</p>
          <h2>{article.product_name}</h2>
          <span>
            PMID {article.pmid} · {percent(article.confidence_score)} confidence
          </span>
        </div>

        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="review-tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="review-content">
        {activeTab === "Overview" && (
          <Section title="Hits Output Carried Forward">
            <Row label="QC" value={article.qc_required ? "QC Required" : "Pass"} />
            <Row label="PMID" value={article.pmid} />
            <Row label="Title" value={article.title} />
            <Row label="Journal" value={article.journal} />
            <Row label="Publication Date" value={article.publication_date} />
            <Row label="Product" value={article.product_name} />
            <Row label="Country" value={article.country_of_interest} />
            <Row label="Primary Author" value={article.primary_author} />
            <Row label="Confidence" value={percent(article.confidence_score)} />
            <Row label="Hits Status" value={article.hits_status} />
            <Row label="Screening Status" value={article.screening_status} />

            <div className="evidence-card">
              <strong>Evidence Sentence</strong>
              <p>{article.evidence_sentence}</p>
            </div>
          </Section>
        )}

        {activeTab === "Product Assessment" && (
          <Section title="Product Assessment">
            <Row label="Company Suspect Drug(s)" value={list(article.company_suspect_drugs)} />
            <Row label="Active MAH" value={article.active_mah} />
            <Row label="Co-Suspect Drug(s)" value={list(article.co_suspect_drugs)} />
            <Row label="Concomitant Medication(s)" value={list(article.concomitant_medications)} />
            <Row label="Treatment Medication(s)" value={list(article.treatment_medications)} />

            <div className="evidence-card">
              <strong>Reviewer Note</strong>
              <p>
                Product classification remains a screening-level assessment. Detailed dose,
                indication, action taken, and drug chronology will be handled in Intake.
              </p>
            </div>
          </Section>
        )}

        {activeTab === "Safety Assessment" && (
          <Section title="Safety Assessment">
            <Row label="Clinical Event(s)" value={list(article.clinical_events)} />
            <Row label="Special Situation(s)" value={list(article.special_situations)} />
            <Row label="Event Severity" value={article.event_severity} />
            <Row label="Seriousness" value={article.seriousness} />
            <Row label="Patient Safety" value={article.patient_safety} />
            <Row label="Patient Identification / PII" value={article.patient_identification_pii} />

            <div className="evidence-card">
              <strong>PV Workflow Note</strong>
              <p>
                This is still a screened literature article. It becomes a PV case only after
                Intake review and booking are completed.
              </p>
            </div>
          </Section>
        )}

        {activeTab === "Regulatory Assessment" && (
          <Section title="Regulatory Assessment">
            <Row label="Country of Interest (COI)" value={article.coi} />
            <Row label="Active MAH" value={article.active_mah} />
            <Row label="Patient Safety" value={article.patient_safety} />
            <Row label="Patient Identification / PII" value={article.patient_identification_pii} />
            <Row label="Screening Decision" value={article.screening_decision} />

            <div className="evidence-card">
              <strong>Screening Reasoning</strong>
              <p>{article.screening_reasoning}</p>
            </div>
          </Section>
        )}

        {activeTab === "AI Assessment" && (
          <Section title="AI Assessment">
            <div className="confidence-card">
              <strong>{percent(article.confidence_score)}</strong>
              <span>AI screening confidence</span>
            </div>

            <div className="evidence-card">
              <strong>Evidence Used</strong>
              <p>Hits output, product detection, MAH validation, PII detection, COI logic, flags.</p>
            </div>

            <div className="evidence-card">
              <strong>Future RAG Layer</strong>
              <p>
                Placeholder for ClinixAI Gold SOPs, Client SOPs, Work Instructions,
                Regulatory Guidelines, and AI Explainability.
              </p>
            </div>
          </Section>
        )}

        {activeTab === "Flags" && (
          <Section title="Reviewer Attention Items">
            {article.flags.length === 0 && <p>No flags detected.</p>}

            {article.flags.map((flag) => (
              <div className="flag-card" key={flag}>
                ⚠ {flag}
              </div>
            ))}
          </Section>
        )}

        {activeTab === "Audit" && (
          <Section title="21 CFR / GxP Audit Trail">
            {article.audit_trail.length === 0 && <p>No audit actions captured yet.</p>}

            {article.audit_trail.map((event) => (
              <div className="audit-card" key={event.id}>
                <strong>{event.action}</strong>
                <p>{event.timestamp}</p>
                <p>
                  <b>Old:</b> {event.oldValue}
                </p>
                <p>
                  <b>New:</b> {event.newValue}
                </p>
                <p>
                  <b>Reason:</b> {event.reason}
                </p>
                <p>
                  <b>By:</b> {event.performedBy} · {event.role}
                </p>
              </div>
            ))}
          </Section>
        )}
      </div>

      <div className="review-actions">
        <button
          className="danger-button"
          onClick={() =>
            setModal({
              title: "Reason required to exclude Screening article",
              action: "exclude",
            })
          }
        >
          Exclude
        </button>

        <button
          onClick={() =>
            setModal({
              title: "Reason required to save Screening review",
              action: "save",
            })
          }
        >
          Save
        </button>

        <button
          onClick={() =>
            setModal({
              title: "Reason required to re-run AI",
              action: "rerun",
            })
          }
        >
          Re-run AI
        </button>

        <button
          className="primary-action"
          onClick={() =>
            setModal({
              title: "Reason required to approve Screening output to Intake",
              action: "approve",
            })
          }
        >
          Approve to Intake
        </button>
      </div>

      {modal && (
        <ReasonModal
          title={modal.title}
          onCancel={() => setModal(null)}
          onSubmit={submitReason}
        />
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="review-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{clean(value)}</strong>
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
        <h3>{title}</h3>
        <p>GxP control: reason is mandatory and will be captured in audit trail.</p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter clear business reason..."
        />

        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary-action" disabled={!valid} onClick={() => onSubmit(reason)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}