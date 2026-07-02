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

const tabs = ["Overview", "Eligibility", "Safety Assessment", "AI Assessment", "Flags", "Audit"];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
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
          <Section title="Article Metadata">
            <Row label="Title" value={article.title} />
            <Row label="Journal" value={article.journal} />
            <Row label="Publication Date" value={article.publication_date} />
            <Row label="Country" value={article.country_of_interest} />
            <Row label="Primary Author" value={article.primary_author} />
            <Row label="Screening Decision" value={article.screening_decision} />

            <div className="evidence-card">
              <strong>Evidence Sentence</strong>
              <p>{article.evidence_sentence}</p>
            </div>
          </Section>
        )}

        {activeTab === "Eligibility" && (
          <Section title="Eligibility Assessment">
            <div className="evidence-card">
              <strong>Inclusion Criteria</strong>
              <p>Human safety information, product exposure, reporter, and patient details present.</p>
            </div>

            <div className="evidence-card">
              <strong>Exclusion Criteria</strong>
              <p>No clear exclusion reason identified at Screening stage.</p>
            </div>

            <div className="evidence-card">
              <strong>Reason</strong>
              <p>
                Article requires human Screening because it contains potential safety information
                and may require Intake review.
              </p>
            </div>
          </Section>
        )}

        {activeTab === "Safety Assessment" && (
          <Section title="Potential Safety Information">
            <Row label="Adverse Event / Safety Event" value={article.adverse_event} />
            <Row label="Suspect Product" value={article.suspect_product} />
            <Row label="Patient Information" value={article.patient} />
            <Row label="Reporter Information" value={article.reporter} />
            <Row label="Minimum Criteria Assessment" value={article.minimum_criteria} />
            <Row
              label="Validity Recommendation for Intake"
              value={article.validity_recommendation}
            />

            <div className="evidence-card">
              <strong>PV Workflow Note</strong>
              <p>
                This is still a screened literature article. It becomes a PV case only after
                Intake review and booking are completed.
              </p>
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
              <strong>Reasoning</strong>
              <p>{article.ai_reasoning}</p>
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
              title: "Reason required to approve Screening article to Intake",
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