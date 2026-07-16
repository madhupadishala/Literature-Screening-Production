import WorkflowStatusBadge from "./WorkflowStatusBadge";

export type WorkflowPackage = {
  package_id: string;
  pmid: string;
  title: string;
  status: string;
  updated_at: string;
  hits_count: number;
  screening_count: number;
  intake_input_count: number;
};

type WorkflowTableProps = {
  packages: WorkflowPackage[];
  runningPackage: string | null;
  onOpenPackage: (packageId: string) => void;
  onRunWorkflow: (packageId: string) => void;
};

function getActionLabel(status: string) {
  if (status === "INTAKE_INPUT_CREATED") return "View";
  if (status === "NEW") return "Run Hits";
  if (status === "HITS_COMPLETE") return "Run Screening";
  if (status === "SCREENING_COMPLETE") return "Build Intake";
  if (status.includes("RUNNING")) return "Running...";
  return "Run";
}

function getProgressPercent(pkg: WorkflowPackage) {
  let completed = 0;
  if (pkg.hits_count > 0) completed += 1;
  if (pkg.screening_count > 0) completed += 1;
  if (pkg.intake_input_count > 0) completed += 1;
  return Math.round((completed / 3) * 100);
}

export default function WorkflowTable({
  packages,
  runningPackage,
  onOpenPackage,
  onRunWorkflow,
}: WorkflowTableProps) {
  return (
    <div className="table-wrap">
      <table className="workflow-table">
        <thead>
          <tr>
            <th>Package</th>
            <th>PMID</th>
            <th>Title</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Hits</th>
            <th>Screening</th>
            <th>Intake</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {packages.map((pkg) => {
            const progress = getProgressPercent(pkg);
            const isRunning = runningPackage === pkg.package_id;
            const actionLabel = isRunning ? "Running..." : getActionLabel(pkg.status);

            return (
              <tr
                key={pkg.package_id}
                className="clickable-row"
                onClick={() => onOpenPackage(pkg.package_id)}
              >
                <td className="mono">{pkg.package_id}</td>
                <td>{pkg.pmid || "—"}</td>
                <td>
                  <strong>{pkg.title || "Untitled evidence package"}</strong>
                </td>
                <td>
                  <WorkflowStatusBadge status={pkg.status || "NEW"} />
                </td>
                <td>
                  <div className="progress-cell">
                    <div className="progress-bar">
                      <div style={{ width: `${progress}%` }} />
                    </div>
                    <span>{progress}%</span>
                  </div>
                </td>
                <td>{pkg.hits_count || 0}</td>
                <td>{pkg.screening_count || 0}</td>
                <td>{pkg.intake_input_count || 0}</td>
                <td>{pkg.updated_at || "—"}</td>
                <td>
                  <button
                    className="review-button"
                    disabled={isRunning || pkg.status.includes("RUNNING")}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (pkg.status === "INTAKE_INPUT_CREATED") {
                        onOpenPackage(pkg.package_id);
                        return;
                      }

                      onRunWorkflow(pkg.package_id);
                    }}
                  >
                    {actionLabel}
                  </button>
                </td>
              </tr>
            );
          })}

          {packages.length === 0 && (
            <tr>
              <td colSpan={10} className="empty-cell">
                No workflow packages found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <style jsx>{`
        .table-wrap {
          overflow-x: auto;
        }

        .workflow-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1180px;
        }

        .workflow-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          text-transform: uppercase;
          text-align: left;
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .workflow-table td {
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          font-size: 14px;
        }

        .clickable-row {
          cursor: pointer;
        }

        .clickable-row:hover {
          background: #f8fbff;
        }

        .mono {
          font-family: Consolas, Monaco, monospace;
          font-weight: 800;
          color: #185a9d;
          white-space: nowrap;
        }

        .progress-cell {
          min-width: 130px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .progress-bar {
          width: 90px;
          height: 8px;
          background: #e2e8f0;
          border-radius: 999px;
          overflow: hidden;
        }

        .progress-bar div {
          height: 100%;
          background: #185a9d;
          border-radius: 999px;
        }

        .progress-cell span {
          font-size: 12px;
          font-weight: 800;
          color: #475569;
        }

        .review-button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
          white-space: nowrap;
        }

        .review-button:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }

        .empty-cell {
          text-align: center;
          color: #64748b;
          padding: 32px !important;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}