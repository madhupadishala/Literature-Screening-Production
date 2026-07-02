"use client";

import type { Hit } from "../app/page";

type ReviewWorkspaceProps = {
  hit: Hit;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
  onApprove: () => void;
};

const tabs = ["Overview", "Product", "People", "Patient", "AI Assessment", "Flags"];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clean(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

export default function ReviewWorkspace({
  hit,
  activeTab,
  setActiveTab,
  onClose,
  onApprove,
}: ReviewWorkspaceProps) {
  return (
    <aside className="review-workspace">
      <div className="review-top">
        <div>
          <div className="review-kicker">Review Workspace</div>
          <h2>{hit.product_name || hit.pmid}</h2>
          <span className="status-pill">
            PMID {hit.pmid} · {percent(hit.confidence_score)} confidence
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
            className={tab === activeTab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="review-content">
        {activeTab === "Overview" && (
          <>
            <InfoSection title="Article">
              <Info label="PMID" value={hit.pmid} />
              <Info label="DOI" value={hit.doi} />
              <Info label="Title" value={hit.title} />
              <Info label="Journal" value={hit.journal} />
              <Info label="Publication Date" value={hit.publication_date} />
              <Info label="Hits Status" value={hit.hits_status} />
              <Info label="Screening Status" value={hit.screening_status} />
            </InfoSection>

            <InfoSection title="AI Recommendation">
              <p className="summary-text">{hit.ai_summary}</p>
            </InfoSection>

            <InfoSection title="Evidence Sentence">
              <p className="evidence-box">{hit.evidence_sentence}</p>
            </InfoSection>
          </>
        )}

        {activeTab === "Product" && (
          <InfoSection title="Product Detection">
            <Info label="Product" value={hit.product_name} />
            <Info label="Identity" value={hit.normalized_identity} />
            <Info label="Matched Term" value={hit.matched_term} />
            <Info label="Match Type" value={hit.match_type} />
            <Info label="Match Source" value={hit.match_source} />
            <Info label="Strength" value={hit.detected_strength} />
            <Info label="Formulation" value={hit.detected_formulation} />
            <Info label="Company Product" value={hit.company_product_status} />
            <Info label="MAH Status" value={hit.mah_country_status} />
          </InfoSection>
        )}

        {activeTab === "People" && (
          <InfoSection title="Author & Country">
            <Info label="Primary Author" value={hit.primary_author} />
            <Info label="All Authors" value={(hit.all_authors || []).join(", ")} />
            <Info label="Author Country" value={hit.author_country} />
            <Info label="Country of Interest" value={hit.country_of_interest} />
          </InfoSection>
        )}

        {activeTab === "Patient" && (
          <InfoSection title="Patient / PII">
            <Info label="PII Present" value={hit.pii_present ? "Yes" : "No"} />

            {hit.pii_findings.length === 0 && (
              <p className="muted-paragraph">No patient identifiers detected.</p>
            )}

            {hit.pii_findings.map((item, index) => (
              <Info
                key={`${item.pii_type}-${index}`}
                label={clean(item.pii_type)}
                value={`${item.value} (${percent(item.confidence)})`}
              />
            ))}
          </InfoSection>
        )}

        {activeTab === "AI Assessment" && (
          <>
            <InfoSection title="AI Recommendation">
              <div className="assessment-banner success">✓ Ready for Screening</div>

              <Info
                label="Overall Confidence"
                value={percent(hit.confidence_score)}
              />

              <Info label="Recommendation" value="Ready for Screening" />
            </InfoSection>

            <InfoSection title="AI Reasoning">
              <ul className="reason-list">
                <li>✓ Company product identified</li>
                <li>✓ MAH country validated</li>
                <li>✓ Primary author detected</li>
                <li>✓ Country of interest identified</li>
                <li>✓ Evidence sentence extracted</li>
              </ul>
            </InfoSection>

            <InfoSection title="Evidence Used">
              <div className="source-tags">
                <span>Title</span>
                <span>Abstract</span>
                <span>Product Master</span>
              </div>
            </InfoSection>

            <InfoSection title="Future Knowledge Layer">
              <div className="future-list">
                <span>✓ ClinixAI Gold SOP</span>
                <span>✓ Client SOP</span>
                <span>✓ Work Instructions</span>
                <span>✓ Regulatory Guidelines</span>
                <span>✓ AI Explainability</span>
              </div>
            </InfoSection>
          </>
        )}

        {activeTab === "Flags" && (
          <>
            <InfoSection title="Review Flags">
              <div className="flag green">✓ Company Product Verified</div>
              <div className="flag green">✓ MAH Country Matched</div>
              <div className="flag yellow">⚠ Confidence below 90%</div>
              <div className="flag yellow">⚠ Patient age extracted from narrative</div>
              <div className="flag green">✓ Primary Author Identified</div>
            </InfoSection>

            <InfoSection title="Manual Verification">
              <label className="check-row">
                <input type="checkbox" />
                Verify Patient Information
              </label>

              <label className="check-row">
                <input type="checkbox" />
                Verify Evidence Sentence
              </label>

              <label className="check-row">
                <input type="checkbox" />
                Verify AI Recommendation
              </label>
            </InfoSection>

            <InfoSection title="AI Decision">
              <div className="assessment-banner success">✓ Ready for Screening</div>
            </InfoSection>
          </>
        )}
      </div>

      <div className="review-actions">
        <button className="danger-button">Reject</button>
        <button className="secondary-button">Save</button>
        <button className="secondary-button">Re-run AI</button>
        <button className="primary-button" onClick={onApprove}>
          Approve to Screening
        </button>
      </div>
    </aside>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="info-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{clean(value)}</strong>
    </div>
  );
}