"use client";

import { useCallback, useEffect, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import type { PerformanceReport } from "@/lib/enterprise/performance-service";

export default function PerformancePage() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/monitoring/performance", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || "Performance telemetry is unavailable.");
      setReport(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Performance telemetry is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  return (
    <main className="shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="ENTERPRISE PERFORMANCE"
        title="Performance & Capacity Console"
        subtitle="Tenant-scoped 24-hour throughput, latency percentiles, database pool pressure, slow AI operations, durable snapshots, and explicit operating budgets."
        status="Performance Governed"
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!report ? (
        <section className="loading">
          {loading ? "Loading performance telemetry…" : "No performance telemetry available."}
        </section>
      ) : (
        <>
          <section className="metrics">
            <Metric label="AI p95 latency" value={`${report.latency.aiP95Ms} ms`} />
            <Metric label="Search p95 latency" value={`${report.latency.searchP95Ms} ms`} />
            <Metric label="AI failure rate" value={`${report.reliability.aiFailureRatePercent}%`} />
            <Metric label="DB pool utilization" value={`${report.pool.utilizationPercent}%`} />
            <Metric label="Pool waiters" value={String(report.pool.waiting)} />
          </section>

          <section className="grid two">
            <Panel
              title="24-hour throughput"
              subtitle="Completed production activity in the active tenant."
            >
              <Rows
                rows={[
                  ["Search executions", report.throughput.searches],
                  ["Retrieved records", report.throughput.results],
                  ["Evidence packages", report.throughput.packages],
                  ["AI executions", report.throughput.aiExecutions],
                ]}
              />
            </Panel>
            <Panel
              title="Performance budgets"
              subtitle="Early-warning and failure thresholds for core operating metrics."
            >
              <div className="budget-list">
                {report.budgets.map((item) => (
                  <article key={item.metric}>
                    <div>
                      <strong>{item.metric}</strong>
                      <small>Target {item.target}</small>
                    </div>
                    <span className={item.status}>
                      {item.actual} · {item.status}
                    </span>
                  </article>
                ))}
              </div>
            </Panel>
          </section>

          <Panel
            title="AI operation latency"
            subtitle="Aggregated by governed execution type over the previous 24 hours."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Executions</th>
                    <th>Failures</th>
                    <th>Average</th>
                    <th>p95</th>
                    <th>Maximum</th>
                  </tr>
                </thead>
                <tbody>
                  {report.operations.map((item) => (
                    <tr key={item.operation}>
                      <td>
                        <strong>{item.operation}</strong>
                      </td>
                      <td>{item.executions}</td>
                      <td>{item.failures}</td>
                      <td>{item.averageMs} ms</td>
                      <td>{item.p95Ms} ms</td>
                      <td>{item.maximumMs} ms</td>
                    </tr>
                  ))}
                  {!report.operations.length && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No AI executions recorded in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title="Slowest AI operations"
            subtitle="The 20 highest-latency executions in the active tenant and 24-hour window."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Operation</th>
                    <th>Package</th>
                    <th>Provider / Model</th>
                    <th>Status</th>
                    <th>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {report.slowOperations.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.occurredAt).toLocaleString()}</td>
                      <td>{item.operation}</td>
                      <td>{item.packageKey || "—"}</td>
                      <td>
                        <strong>{item.provider}</strong>
                        <small>{item.model}</small>
                      </td>
                      <td>{item.status}</td>
                      <td>{item.latencyMs} ms</td>
                    </tr>
                  ))}
                  {!report.slowOperations.length && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No measured AI operations in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="refreshed">
            Last refreshed {new Date(report.generatedAt).toLocaleString()} · automatic refresh every
            30 seconds
          </p>
        </>
      )}
      <style jsx>{`
        .shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, sans-serif;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 14px;
        }
        .grid.two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .error,
        .loading {
          margin-bottom: 14px;
          padding: 14px;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #991b1b;
          background: #fef2f2;
          font-size: 11px;
          font-weight: 700;
        }
        .loading {
          color: #475569;
          border-color: #cbd5e1;
          background: #fff;
        }
        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          min-width: 780px;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 12px 14px;
          border-bottom: 1px solid #e8eef5;
          text-align: left;
          font-size: 10px;
        }
        th {
          color: #64748b;
          background: #f8fafc;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        td strong,
        td small {
          display: block;
        }
        td small {
          margin-top: 3px;
          color: #64748b;
        }
        .budget-list {
          display: grid;
          gap: 8px;
          padding: 16px;
        }
        .budget-list article {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 11px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
        }
        .budget-list strong,
        .budget-list small {
          display: block;
        }
        .budget-list small {
          margin-top: 3px;
          color: #64748b;
          font-size: 8px;
        }
        .budget-list span {
          padding: 6px 8px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .pass {
          color: #166534;
          background: #dcfce7;
        }
        .warning {
          color: #92400e;
          background: #fef3c7;
        }
        .fail {
          color: #991b1b;
          background: #fee2e2;
        }
        .empty {
          padding: 28px;
          color: #64748b;
          text-align: center;
        }
        .refreshed {
          color: #64748b;
          font-size: 9px;
          text-align: right;
        }
        @media (max-width: 1100px) {
          .metrics {
            grid-template-columns: repeat(3, 1fr);
          }
          .grid.two {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 700px) {
          .shell {
            padding: 12px;
          }
          .metrics {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .metric {
          padding: 15px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
        }
        span {
          display: block;
          min-height: 25px;
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }
        strong {
          display: block;
          margin-top: 7px;
          color: #185abd;
          font-size: 20px;
        }
      `}</style>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      {children}
      <style jsx>{`
        .panel {
          margin-bottom: 14px;
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 5px 18px rgba(15, 23, 42, 0.05);
        }
        header {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        h2 {
          margin: 0 0 4px;
          font-size: 15px;
        }
        p {
          margin: 0;
          color: #64748b;
          font-size: 9px;
        }
      `}</style>
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, number]> }) {
  return (
    <div className="rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <style jsx>{`
        .rows {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 16px;
        }
        div {
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          background: #f8fafc;
        }
        span {
          display: block;
          color: #64748b;
          font-size: 8px;
          text-transform: uppercase;
        }
        strong {
          display: block;
          margin-top: 5px;
          color: #185abd;
          font-size: 18px;
        }
      `}</style>
    </div>
  );
}
