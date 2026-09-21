"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

type FixtureRow = {
  package_id: string;
  package_key: string;
  status: string;
  workflow_state: string;
  hits_result_id?: string | null;
  hits_result_version?: number | null;
  hits_review_status?: string | null;
  screening_result_id?: string | null;
  screening_result_version?: number | null;
  screening_review_status?: string | null;
  review_workspace_id?: string | null;
  review_workspace_status?: string | null;
  patient_segmentation_status?: string | null;
  labeling_status?: string | null;
  causality_status?: string | null;
  mr_review_status?: string | null;
  created_at: string;
};

type CreatedFixture = {
  fixtureKey: string;
  searchId: string;
  searchKey: string;
  resultId: string;
  validationPackageId: string;
  validationKey: string;
  packageId: string;
  packageKey: string;
  hitsStatus: string;
  workflowState: string;
  labelVersionId: string;
  causalityVersionId: string;
};

function statusTone(value?: string | null): string {
  const normalized = String(value || "").toUpperCase();
  if (
    ["APPROVED", "COMPLETE", "REVIEW_COMPLETE", "INTAKE_INPUT_CREATED"].includes(
      normalized,
    )
  ) {
    return "good";
  }
  if (
    ["REVIEW_REQUIRED", "UNRESOLVED", "FAILED", "EXCLUDED"].includes(normalized)
  ) {
    return "warn";
  }
  return "pending";
}

export default function Sprint6CValidationLabPage() {
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [reason, setReason] = useState(
    "Create controlled synthetic Sprint 6C positive end-to-end validation fixture.",
  );
  const [created, setCreated] = useState<CreatedFixture | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/validation-lab/sprint6c", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load validation fixtures.");
      }
      setFixtures(Array.isArray(payload.data?.fixtures) ? payload.data.fixtures : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function createFixture() {
    if (reason.trim().length < 8) {
      setMessage("Enter a specific audit reason before creating the fixture.");
      return;
    }
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/validation-lab/sprint6c", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create Sprint 6C fixture.");
      }
      setCreated(payload.data.fixture as CreatedFixture);
      setMessage(
        "Controlled synthetic fixture created and promoted to Hits. Human review remains required at each governed decision stage.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="SPRINT 6C · CONTROLLED END-TO-END VALIDATION"
        title="Positive Validation Path"
        subtitle="Creates a synthetic, auditable case designed to exercise Search → Hits → Screening → Review/MR → Intake without contaminating production regulatory reference data."
        status="Synthetic validation only"
      />

      <section className="warning">
        <strong>Not a real publication or safety case.</strong>
        <span>
          This harness creates TEST_VALIDATION search data and validation-only Label/RSI and causality configurations. Human approvals remain mandatory.
        </span>
      </section>

      <section className="grid">
        <article className="card">
          <span>Controlled case</span>
          <h2>Paracetamol → Urticaria · India</h2>
          <p>
            Synthetic single-patient case with direct treatment/event location evidence in Hyderabad, India and an active demo Product Master match.
          </p>
        </article>
        <article className="card">
          <span>Validation-only Label / RSI</span>
          <h2>Urticaria = Expected</h2>
          <p>
            Scoped to VALIDATION_ONLY. It is excluded from ordinary production Review workspaces.
          </p>
        </article>
        <article className="card">
          <span>Validation-only causality</span>
          <h2>Structured clinical judgement</h2>
          <p>
            Controlled conclusions are available only inside this synthetic fixture path.
          </p>
        </article>
      </section>

      <section className="create-panel">
        <label>
          <span>Audit reason</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" disabled={creating} onClick={() => void createFixture()}>
          {creating ? "Creating fixture + running Hits AI…" : "Create Positive E2E Fixture"}
        </button>
      </section>

      {message && <div className="message">{message}</div>}

      {created && (
        <section className="created">
          <div>
            <span>Created package</span>
            <strong>{created.packageKey}</strong>
            <small>{created.packageId}</small>
          </div>
          <div>
            <span>Current state</span>
            <strong>{created.workflowState}</strong>
            <small>Hits status: {created.hitsStatus}</small>
          </div>
          <div className="actions">
            <Link href="/hits">1. Open Hits</Link>
            <Link href="/screening">2. Screening</Link>
            <Link href="/review">3. Review / MR</Link>
            <Link href="/workflow">Workflow trace</Link>
          </div>
        </section>
      )}

      <section className="path">
        <h2>Required human-controlled path</h2>
        <div className="steps">
          <Step n="1" title="Fixture Search + Hits AI" detail="Created automatically as TEST_VALIDATION and explicitly promoted to Hits." />
          <Step n="2" title="Hits human approval" detail="Reviewer confirms the article is relevant enough to proceed." />
          <Step n="3" title="Screening AI + human INCLUDE" detail="Country, Product Master and company applicability must resolve from governed evidence." />
          <Step n="4" title="Patient extraction + confirmation" detail="AI proposes source-linked patient data; reviewer explicitly saves segmentation." />
          <Step n="5" title="Expectedness + causality" detail="Uses only VALIDATION_ONLY governed references created for this fixture." />
          <Step n="6" title="Medical Review → Intake" detail="MR approval completes Review and unlocks governed Intake generation." />
        </div>
      </section>

      <section className="history">
        <header>
          <div>
            <span>Validation run history</span>
            <h2>Sprint 6C fixtures</h2>
          </div>
          <button type="button" onClick={() => void load()}>Refresh</button>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Workflow</th>
                <th>Hits</th>
                <th>Screening</th>
                <th>Patients</th>
                <th>Labeling</th>
                <th>Causality</th>
                <th>MR</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((fixture) => (
                <tr key={fixture.package_id}>
                  <td><strong>{fixture.package_key}</strong><small>{fixture.package_id}</small></td>
                  <td><Status value={fixture.workflow_state} /></td>
                  <td><Status value={fixture.hits_review_status || "PENDING"} /></td>
                  <td><Status value={fixture.screening_review_status || "NOT_STARTED"} /></td>
                  <td><Status value={fixture.patient_segmentation_status || "NOT_STARTED"} /></td>
                  <td><Status value={fixture.labeling_status || "NOT_STARTED"} /></td>
                  <td><Status value={fixture.causality_status || "NOT_STARTED"} /></td>
                  <td><Status value={fixture.mr_review_status || "NOT_STARTED"} /></td>
                  <td>{fixture.created_at || "—"}</td>
                </tr>
              ))}
              {!loading && fixtures.length === 0 && (
                <tr><td colSpan={9} className="empty">No Sprint 6C validation fixture has been created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .warning{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;padding:13px 16px;border:1px solid #f59e0b;border-radius:10px;background:#fffbeb;color:#92400e;font-size:10px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.card,.create-panel,.path,.history,.created{border:1px solid #dbe4ef;border-radius:12px;background:#fff}
        .card{padding:15px}.card span,.history header span{color:#1d4ed8;font-size:8px;font-weight:900;text-transform:uppercase}.card h2{margin:7px 0;font-size:15px}.card p,.path p{margin:0;color:#64748b;font-size:9px;line-height:1.55}
        .create-panel{display:flex;gap:12px;align-items:end;padding:15px;margin-bottom:14px}.create-panel label{flex:1}.create-panel span{display:block;margin-bottom:5px;color:#475569;font-size:8px;font-weight:900;text-transform:uppercase}
        input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:9px;font:inherit;font-size:10px}
        button,.actions :global(a){border:0;border-radius:8px;padding:9px 12px;background:#185abd;color:#fff;font:inherit;font-size:9px;font-weight:800;text-decoration:none;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}
        .message{margin-bottom:14px;padding:11px 13px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:10px}
        .created{display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;padding:15px;margin-bottom:14px}.created span{display:block;color:#64748b;font-size:8px;font-weight:900;text-transform:uppercase}.created strong,.created small{display:block;margin-top:4px}.created small{color:#64748b;font-size:8px;word-break:break-all}.actions{display:flex;gap:7px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
        .path{padding:16px;margin-bottom:14px}.path h2{margin:0 0 12px;font-size:16px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.step{padding:11px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc}.step-num{display:grid;width:23px;height:23px;place-items:center;border-radius:50%;background:#1d4ed8;color:#fff;font-size:9px;font-weight:900}.step strong{display:block;margin:7px 0 4px;font-size:10px}
        .history{overflow:hidden}.history header{display:flex;justify-content:space-between;align-items:center;padding:15px;border-bottom:1px solid #e2e8f0}.history h2{margin:4px 0 0;font-size:16px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:9px}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}th{background:#f8fafc;color:#64748b;font-size:8px;text-transform:uppercase}td strong,td small{display:block}td small{margin-top:3px;color:#94a3b8}.empty{text-align:center;color:#64748b;padding:24px}
        @media(max-width:900px){.grid,.steps,.created{grid-template-columns:1fr}.create-panel{display:block}.create-panel button{margin-top:10px}.actions{justify-content:flex-start}}
        @media(max-width:700px){.app-shell{padding:12px}.warning{flex-direction:column}}
      `}</style>
    </main>
  );
}

function Step({ n, title, detail }: { n: string; title: string; detail: string }) {
  return <article className="step"><span className="step-num">{n}</span><strong>{title}</strong><p>{detail}</p></article>;
}

function Status({ value }: { value: string }) {
  return <span className={`status ${statusTone(value)}`}>{String(value || "—").replaceAll("_", " ")}<style jsx>{`
    .status{display:inline-block;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900;text-transform:uppercase}
    .good{background:#dcfce7;color:#166534}.warn{background:#fef3c7;color:#92400e}.pending{background:#dbeafe;color:#1e40af}
  `}</style></span>;
}
