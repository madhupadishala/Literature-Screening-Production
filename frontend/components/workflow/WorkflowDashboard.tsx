import WorkflowStatusBadge from "./WorkflowStatusBadge";
import type { WorkflowPackage } from "./WorkflowTable";

type WorkflowDashboardProps = {
  packages: WorkflowPackage[];
  loading?: boolean;
  onOpenPackage: (packageId: string) => void;
};

function formatDate(value?: string) {
  if (!value) return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  } catch {
    return value;
  }
}

// Updated: Calibrated to a pure 2-step process (Hits & Screening) so 0% locks are eliminated
function getProgress(pkg: WorkflowPackage) {
  let score = 0;
  if (Number(pkg.hits_count ?? 0) > 0) score += 1;
  if (Number(pkg.screening_count ?? 0) > 0) score += 1;
  return Math.round((score / 2) * 100);
}

export default function WorkflowDashboard({
  packages,
  loading = false,
  onOpenPackage,
}: WorkflowDashboardProps) {
  // Packages are marked completed if they have successfully made it past screening metrics
  const completed = packages.filter((p) => Number(p.screening_count ?? 0) > 0 && !p.status.includes("RUNNING"));
  const running = packages.filter((p) => p.status.includes("RUNNING"));
  const pending = packages.filter((p) => Number(p.screening_count ?? 0) === 0 && !p.status.includes("RUNNING"));

  const hits = packages.reduce((sum, p) => sum + Number(p.hits_count || 0), 0);
  const screening = packages.reduce((sum, p) => sum + Number(p.screening_count || 0), 0);

  // Unlocked: Flags records for review without looking for old intake metrics
  const attentionNeeded = packages
    .filter((p) => Number(p.hits_count ?? 0) === 0 || Number(p.screening_count ?? 0) === 0)
    .slice(0, 5);

  const recentActivity = [...packages]
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, 6);

  return (
    <section className="dashboard-shell">
      <div className="dashboard-hero">
        <div>
          <span>ClinixAI Literature Screening V1</span>
          <h2>Operational Dashboard</h2>
          <p>
            Monitor evidence packages seamlessly across universal Hits extraction and Screening stages.
          </p>
        </div>

        <div className="hero-score">
          <strong>{packages.length}</strong>
          <span>Total Packages</span>
        </div>
      </div>

      {/* Rebalanced Grid: Shifted cleanly to 6 layout cards now that Intake is gone */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span>Total Packages</span>
          <strong>{packages.length}</strong>
        </div>

        <div className="kpi-card success">
          <span>Completed</span>
          <strong>{completed.length}</strong>
        </div>

        <div className="kpi-card warning">
          <span>Pending</span>
          <strong>{pending.length}</strong>
        </div>

        <div className="kpi-card active">
          <span>Running</span>
          <strong>{running.length}</strong>
        </div>

        <div className="kpi-card">
          <span>Hits Generated</span>
          <strong>{hits}</strong>
        </div>

        <div className="kpi-card">
          <span>Screening Records</span>
          <strong>{screening}</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-panel">
          <div className="panel-title">
            <h3>Attention Needed</h3>
            <p>Packages requiring active QC validation or pipeline data review.</p>
          </div>

          {loading ? (
            <div className="empty-state">Loading workflow packages...</div>
          ) : attentionNeeded.length === 0 ? (
            <div className="empty-state success">No immediate action required.</div>
          ) : (
            <div className="package-list">
              {attentionNeeded.map((pkg) => (
                <button
                  key={pkg.package_id}
                  className="package-row"
                  onClick={() => onOpenPackage(pkg.package_id)}
                >
                  <div>
                    <strong>{pkg.package_id}</strong>
                    <span>{pkg.title || "Untitled evidence package"}</span>
                  </div>

                  <div className="package-meta">
                    <WorkflowStatusBadge status={pkg.status || "NEW"} />
                    <small>{getProgress(pkg)}%</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dashboard-panel">
          <div className="panel-title">
            <h3>Recent Workflow Activity</h3>
            <p>Latest updated evidence packages.</p>
          </div>

          {loading ? (
            <div className="empty-state">Loading recent activity...</div>
          ) : recentActivity.length === 0 ? (
            <div className="empty-state">No recent activity available.</div>
          ) : (
            <div className="activity-list">
              {recentActivity.map((pkg) => (
                <button
                  key={pkg.package_id}
                  className="activity-row"
                  onClick={() => onOpenPackage(pkg.package_id)}
                >
                  <div>
                    <strong>{pkg.package_id}</strong>
                    <span>{pkg.pmid || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"} Ãƒâ€šÃ‚Â· {pkg.title || "Untitled evidence package"}</span>
                  </div>

                  <small>{formatDate(pkg.updated_at)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .dashboard-shell {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .dashboard-hero {
          background: linear-gradient(135deg, #071b34, #123f68);
          color: #ffffff;
          border-radius: 22px;
          padding: 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
        }

        .dashboard-hero span {
          color: #cfe7ff;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .dashboard-hero h2 {
          margin: 8px 0;
          font-size: 30px;
        }

        .dashboard-hero p {
          margin: 0;
          color: #dbeafe;
          max-width: 720px;
          line-height: 1.6;
        }

        .hero-score {
          min-width: 150px;
          min-height: 120px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.22);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .hero-score strong {
          font-size: 42px;
        }

        .hero-score span {
          color: #dbeafe;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
        }

        .kpi-card {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .kpi-card span {
          display: block;
          color: #64748b;
          font-size: 12px;
          margin-bottom: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .kpi-card strong {
          font-size: 28px;
          color: #0f172a;
        }

        .kpi-card.success strong {
          color: #15803d;
        }

        .kpi-card.warning strong {
          color: #b45309;
        }

        .kpi-card.active strong {
          color: #185a9d;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }

        .dashboard-panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .panel-title {
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .panel-title h3 {
          margin: 0 0 6px;
          font-size: 18px;
        }

        .panel-title p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }

        .package-list,
        .activity-list {
          display: flex;
          flex-direction: column;
        }

        .package-row,
        .activity-row {
          border: none;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 16px 20px;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }

        .package-row:hover,
        .activity-row:hover {
          background: #f8fbff;
        }

        .package-row strong,
        .activity-row strong {
          display: block;
          color: #185a9d;
          font-size: 14px;
          margin-bottom: 5px;
        }

        .package-row span,
        .activity-row span {
          display: block;
          color: #334155;
          font-size: 13px;
          line-height: 1.4;
        }

        .package-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }

        small {
          color: #64748b;
          font-size: 12px;
          white-space: nowrap;
        }

        .empty-state {
          padding: 28px;
          color: #64748b;
          font-weight: 700;
        }

        .empty-state.success {
          color: #15803d;
        }

        @media (max-width: 1300px) {
          .kpi-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 1000px) {
          .dashboard-hero,
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-hero {
            flex-direction: column;
            align-items: flex-start;
            gap: 18px;
          }

          .hero-score {
            width: 100%;
          }

          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 650px) {
          .kpi-grid {
            grid-template-columns: 1fr;
          }

          .package-row,
          .activity-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .package-meta {
            align-items: flex-start;
          }
        }
      `}</style>
    </section>
  );
}