"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

type Control = {
  id: string;
  category: string;
  requirement: string;
  automated: boolean;
  status: "PASS" | "FAIL" | "NOT_EXECUTED" | "MANUAL_REQUIRED";
  evidence: Record<string, unknown>;
  evidencePaths: string[];
};

type PackageSummary = {
  id: string;
  validation_key: string;
  package_version: number;
  scope: string;
  build_sha: string;
  release_version: string;
  status: string;
  content_sha256: string;
  generated_at: string;
  generated_by?: string;
  signoffs: Array<Record<string, unknown>>;
};

type PackageDetail = PackageSummary & {
  payload: {
    automatedSummary?: {
      passed: number;
      failed: number;
      manualRequired: number;
      notExecuted: number;
      status: string;
    };
    controls?: Control[];
    qualificationBoundary?: Record<string, unknown>;
    requiredSignoffs?: string[];
  };
};

export default function SystemValidationPage() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [selected, setSelected] = useState<PackageDetail | null>(null);
  const [reason, setReason] = useState(
    "Generate controlled system validation evidence package for release readiness review.",
  );
  const [signoffRole, setSignoffRole] = useState("VALIDATION_OWNER");
  const [decision, setDecision] = useState("APPROVED");
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/system-validation?limit=100", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "Unable to load validation packages.");
    }
    setPackages(Array.isArray(payload.data?.packages) ? payload.data.packages : []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) =>
        setMessage(error instanceof Error ? error.message : String(error)),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function open(id: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/system-validation?id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load validation package.");
      }
      setSelected(payload.data.validationPackage as PackageDetail);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (reason.trim().length < 8) {
      setMessage("Enter a specific validation-package generation reason.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/system-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "GENERATE", reason }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Validation package generation failed.");
      }
      setMessage(
        "Validation evidence package generated. System-generated evidence does not replace IQ/OQ/PQ/UAT or human Quality approval.",
      );
      await load();
      await open(payload.data.validationPackage.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signoff() {
    if (!selected) return;
    if (comments.trim().length < 8) {
      setMessage("Enter a specific sign-off comment.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/system-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "SIGNOFF",
          validationPackageId: selected.id,
          signoffRole,
          decision,
          comments,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Validation sign-off failed.");
      }
      setSelected(payload.data.validationPackage as PackageDetail);
      setComments("");
      setMessage("Validation sign-off recorded in the audit trail.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const controls = useMemo(
    () => (Array.isArray(selected?.payload?.controls) ? selected?.payload.controls : []),
    [selected],
  );

  return (
    <main className="shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="SPRINT 10 · VALIDATION & RELEASE READINESS"
        title="System Validation Package"
        subtitle="Build-scoped automated evidence, traceability controls and controlled human sign-off. Generated evidence never self-declares the GxP system validated."
        status="Evidence governed · Human approval required"
      />

      <section className="boundary">
        <strong>Validation boundary</strong>
        <span>
          Automated checks can demonstrate configured controls and technical evidence. IQ/OQ/PQ/UAT execution, Quality review and release approval remain human responsibilities.
        </span>
      </section>

      <section className="generator">
        <label>
          <span>Generation reason</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={() => void generate()} disabled={busy}>
          {busy ? "Working…" : "Generate Validation Package"}
        </button>
      </section>

      {message && <div className="message">{message}</div>}

      <section className="panel">
        <header>
          <div>
            <span>Immutable evidence packages</span>
            <h2>Validation package history</h2>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Validation key</th>
                <th>Build</th>
                <th>Release</th>
                <th>Status</th>
                <th>Generated</th>
                <th>SHA-256</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td><strong>{pkg.validation_key}</strong><small>{pkg.id}</small></td>
                  <td>{pkg.build_sha}</td>
                  <td>{pkg.release_version}</td>
                  <td><Status value={pkg.status} /></td>
                  <td>{pkg.generated_at}</td>
                  <td><small>{pkg.content_sha256}</small></td>
                  <td><button type="button" onClick={() => void open(pkg.id)}>Open</button></td>
                </tr>
              ))}
              {packages.length === 0 && (
                <tr><td colSpan={7} className="empty">No system validation package has been generated.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="panel detail">
          <header>
            <div>
              <span>{selected.validation_key}</span>
              <h2>Validation controls</h2>
              <p>{selected.build_sha} · {selected.release_version}</p>
            </div>
            <Status value={selected.status} />
          </header>

          <div className="summary-grid">
            <Summary label="Passed" value={selected.payload?.automatedSummary?.passed || 0} />
            <Summary label="Failed" value={selected.payload?.automatedSummary?.failed || 0} />
            <Summary label="Manual required" value={selected.payload?.automatedSummary?.manualRequired || 0} />
            <Summary label="Not executed" value={selected.payload?.automatedSummary?.notExecuted || 0} />
          </div>

          <div className="control-list">
            {controls.map((control) => (
              <article key={control.id}>
                <div className="control-head">
                  <div>
                    <strong>{control.id} · {control.category}</strong>
                    <p>{control.requirement}</p>
                  </div>
                  <Status value={control.status} />
                </div>
                <small>{control.evidencePaths.join(" · ")}</small>
                <pre>{JSON.stringify(control.evidence, null, 2)}</pre>
              </article>
            ))}
          </div>

          <section className="signoff">
            <h3>Controlled sign-off</h3>
            <div className="grid">
              <label><span>Role</span>
                <select value={signoffRole} onChange={(event) => setSignoffRole(event.target.value)}>
                  <option value="VALIDATION_OWNER">Validation Owner</option>
                  <option value="QUALITY_APPROVER">Quality Approver</option>
                  <option value="RELEASE_APPROVER">Release Approver</option>
                </select>
              </label>
              <label><span>Decision</span>
                <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
            </div>
            <label><span>Sign-off comments</span>
              <input value={comments} onChange={(event) => setComments(event.target.value)} />
            </label>
            <button type="button" disabled={busy} onClick={() => void signoff()}>
              Record Sign-off
            </button>
            <pre>{JSON.stringify(selected.signoffs || [], null, 2)}</pre>
          </section>
        </section>
      )}

      <style jsx>{`
        .shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .boundary,.generator,.panel{border:1px solid #cbd5e1;border-radius:6px;background:#fff}
        .boundary{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;padding:12px 15px;background:#fff7ed;color:#9a3412;font-size:10px}
        .generator{display:flex;gap:12px;align-items:end;padding:15px;margin-bottom:14px}.generator label{flex:1}
        label span{display:block;margin-bottom:4px;color:#475569;font-size:8px;font-weight:900;text-transform:uppercase}
        input,select{width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;font:inherit;font-size:9px}
        button{border:0;border-radius:5px;padding:9px 12px;background:#185abd;color:#fff;font:inherit;font-size:9px;font-weight:800;cursor:pointer}button:disabled{opacity:.5}
        .message{margin-bottom:14px;padding:10px 12px;border:1px solid #93c5fd;border-radius:5px;background:#eff6ff;color:#1e3a8a;font-size:9px}
        .panel{margin-bottom:14px;overflow:hidden}.panel>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:15px;border-bottom:1px solid #e2e8f0}.panel header span{color:#185abd;font-size:8px;font-weight:900;text-transform:uppercase}.panel h2{margin:4px 0;font-size:17px}.panel header p{margin:0;color:#64748b;font-size:9px}
        .table-wrap{overflow-x:auto}table{width:100%;min-width:950px;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;font-size:8px}th{background:#f8fafc;color:#64748b;font-size:7px;text-transform:uppercase}td strong,td small{display:block}td small{margin-top:3px;color:#64748b;word-break:break-all}.empty{text-align:center;padding:24px;color:#64748b}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px}.control-list{padding:0 14px 14px}.control-list article{margin-top:9px;padding:12px;border:1px solid #e2e8f0;border-radius:5px}.control-head{display:flex;justify-content:space-between;gap:12px}.control-head p{margin:5px 0;color:#475569;font-size:9px;line-height:1.5}.control-list small{display:block;color:#64748b;font-size:7px}.control-list pre,.signoff pre{overflow:auto;padding:9px;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:7px}
        .signoff{margin:0 14px 14px;padding:14px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff}.signoff h3{margin:0 0 10px;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.signoff label{display:block;margin-bottom:9px}
        @media(max-width:800px){.shell{padding:12px}.generator,.boundary{flex-direction:column;align-items:stretch}.summary-grid,.grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </main>
  );
}

function Status({ value }: { value: string }) {
  const normalized = String(value || "").toUpperCase();
  const cls = ["PASS", "APPROVED", "READY_FOR_QA_REVIEW"].includes(normalized)
    ? "good"
    : ["FAIL", "BLOCKED", "REJECTED"].includes(normalized)
      ? "bad"
      : "pending";
  return <span className={`status ${cls}`}>{normalized.replaceAll("_", " ")}<style jsx>{`
    .status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900;text-transform:uppercase}.good{background:#dcfce7;color:#166534}.bad{background:#fee2e2;color:#991b1b}.pending{background:#fef3c7;color:#92400e}
  `}</style></span>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <article className="summary"><span>{label}</span><strong>{value}</strong><style jsx>{`
    .summary{padding:11px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:7px;text-transform:uppercase}.summary strong{display:block;margin-top:4px;font-size:18px}
  `}</style></article>;
}
