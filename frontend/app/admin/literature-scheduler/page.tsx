"use client";

import { useCallback, useEffect, useState } from "react";

import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

type Run = {
  id: string;
  schedule_key: string;
  scheduled_for: string;
  status: string;
  result_count: number;
  hits_package_count: number;
  hits_failed_count: number;
  search_id?: string | null;
  search_evidence_package_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type Alert = {
  id: string;
  schedule_key: string;
  alert_type: string;
  status: string;
  severity: string;
  message: string;
  created_at: string;
};

function tone(value: string) {
  const normalized = value.toUpperCase();
  if (["COMPLETED", "RESOLVED"].includes(normalized)) return "good";
  if (["FAILED", "MISSED", "CRITICAL"].includes(normalized)) return "bad";
  if (["PARTIAL", "WARNING", "OPEN"].includes(normalized)) return "warn";
  return "pending";
}

export default function LiteratureSchedulerPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/literature-scheduler", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load scheduled literature operations.");
      }
      setRuns(Array.isArray(payload.data?.runs) ? payload.data.runs : []);
      setAlerts(Array.isArray(payload.data?.alerts) ? payload.data.alerts : []);
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

  async function runDueNow() {
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/literature-scheduler", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to execute due schedules.");
      }
      const evaluated = Array.isArray(payload.data?.runs) ? payload.data.runs : [];
      setMessage(
        evaluated.length > 0
          ? `Scheduler evaluated successfully. ${evaluated.length} schedule action(s) were recorded.`
          : "Scheduler evaluated successfully. No new schedule was due.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="SPRINT 7 · SCHEDULED PRODUCTION SURVEILLANCE"
        title="Literature Scheduler Operations"
        subtitle="Monitor governed Search Profile executions, Search Evidence Packages, Hits handoff, missed searches, failures, and catch-up operations."
        status="Versioned · Idempotent · Auditable"
      />

      <section className="summary-grid">
        <Summary label="Scheduled runs" value={String(runs.length)} />
        <Summary
          label="Open alerts"
          value={String(alerts.filter((alert) => alert.status !== "RESOLVED").length)}
        />
        <Summary
          label="Failed / missed"
          value={String(
            runs.filter((run) => ["FAILED", "MISSED"].includes(run.status)).length,
          )}
        />
        <Summary
          label="Search Evidence Packages"
          value={String(runs.filter((run) => Boolean(run.search_evidence_package_id)).length)}
        />
      </section>

      <section className="toolbar">
        <div>
          <strong>Due-schedule evaluator</strong>
          <p>
            Automatic execution is controlled by the deployment scheduler. This action runs the same
            idempotent due-check for the active tenant.
          </p>
        </div>
        <div className="buttons">
          <button type="button" onClick={() => void load()} disabled={loading || running}>
            Refresh
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void runDueNow()}
            disabled={running}
          >
            {running ? "Evaluating…" : "Run Due Schedules Now"}
          </button>
        </div>
      </section>

      {message && <div className="message">{message}</div>}

      <section className="panel">
        <header>
          <div>
            <span>Execution register</span>
            <h2>Scheduled Search Runs</h2>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Schedule</th>
                <th>Scheduled for</th>
                <th>Status</th>
                <th>Results</th>
                <th>Hits</th>
                <th>Hits failed</th>
                <th>Search ID</th>
                <th>SEP</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td><strong>{run.schedule_key}</strong><small>{run.id}</small></td>
                  <td>{run.scheduled_for}</td>
                  <td><Status value={run.status} /></td>
                  <td>{run.result_count}</td>
                  <td>{run.hits_package_count}</td>
                  <td>{run.hits_failed_count}</td>
                  <td><small>{run.search_id || "—"}</small></td>
                  <td><small>{run.search_evidence_package_id || "—"}</small></td>
                </tr>
              ))}
              {!loading && runs.length === 0 && (
                <tr><td colSpan={8} className="empty">No scheduled production run has been recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header>
          <div>
            <span>Operational exceptions</span>
            <h2>Schedule Alerts</h2>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Schedule</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.created_at}</td>
                  <td><strong>{alert.schedule_key}</strong></td>
                  <td>{alert.alert_type.replaceAll("_", " ")}</td>
                  <td><Status value={alert.severity} /></td>
                  <td><Status value={alert.status} /></td>
                  <td>{alert.message}</td>
                </tr>
              ))}
              {!loading && alerts.length === 0 && (
                <tr><td colSpan={6} className="empty">No scheduler alert has been recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
        .toolbar,.panel{border:1px solid #cbd5e1;border-radius:4px;background:#fff;box-shadow:0 3px 10px rgba(15,23,42,.05)}
        .toolbar{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:14px 16px;margin-bottom:14px}
        .toolbar strong{font-size:11px}.toolbar p{margin:4px 0 0;color:#64748b;font-size:9px;line-height:1.5}.buttons{display:flex;gap:7px}
        button{border:1px solid #94a3b8;border-radius:3px;padding:8px 11px;background:#fff;color:#334155;font:inherit;font-size:8px;font-weight:800;cursor:pointer}
        button.primary{border-color:#185abd;background:#185abd;color:#fff}button:disabled{opacity:.5;cursor:not-allowed}
        .message{margin-bottom:14px;padding:10px 12px;border:1px solid #93c5fd;border-radius:3px;background:#eff6ff;color:#1e3a8a;font-size:9px;font-weight:700}
        .panel{margin-bottom:14px;overflow:hidden}.panel header{padding:13px 15px;border-bottom:1px solid #dbe4ef;background:#f8fafc}.panel header span{color:#185abd;font-size:7px;font-weight:900;text-transform:uppercase}.panel h2{margin:3px 0 0;font-size:16px}
        .table-wrap{overflow-x:auto}table{width:100%;min-width:1050px;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;font-size:8px}th{background:#f8fafc;color:#475569;font-size:7px;text-transform:uppercase}td strong,td small{display:block}td small{margin-top:3px;color:#64748b;word-break:break-all}.empty{text-align:center;color:#64748b;padding:24px}
        @media(max-width:900px){.summary-grid{grid-template-columns:repeat(2,1fr)}.toolbar{align-items:flex-start;flex-direction:column}}
        @media(max-width:700px){.app-shell{padding:12px}.summary-grid{grid-template-columns:1fr 1fr}}
      `}</style>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .summary{padding:14px;border:1px solid #cbd5e1;border-radius:4px;background:#fff}
        .summary span{display:block;color:#64748b;font-size:7px;font-weight:900;text-transform:uppercase}
        .summary strong{display:block;margin-top:5px;font-size:20px}
      `}</style>
    </article>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status ${tone(value)}`}>
      {String(value || "—").replaceAll("_", " ")}
      <style jsx>{`
        .status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900;text-transform:uppercase}
        .good{background:#dcfce7;color:#166534}.bad{background:#fee2e2;color:#991b1b}.warn{background:#fef3c7;color:#92400e}.pending{background:#dbeafe;color:#1e40af}
      `}</style>
    </span>
  );
}
