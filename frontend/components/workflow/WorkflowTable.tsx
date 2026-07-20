export type WorkflowPackage = {
  package_id: string;
  pmid?: string;
  title?: string;
  status: string;
  progress?: number;
  hits_count?: number;
  screening_count?: number;
  intake_input_count?: number;
  updated_at?: string;
};

type WorkflowTableProps = {
  packages: WorkflowPackage[];
  runningPackage: string | null;
  onOpenPackage: (packageId: string) => void;
  onRunWorkflow: (packageId: string) => void;
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  HITS_RUNNING: "Hits Running",
  HITS_COMPLETE: "Hits Complete",
  SCREENING_RUNNING: "Screening Running",
  SCREENING_COMPLETE: "Screening Complete",
  INTAKE_INPUT_CREATED: "Downstream Output Ready",
};

function progressFor(pkg: WorkflowPackage) {
  if (typeof pkg.progress === "number") return Math.max(0, Math.min(100, pkg.progress));

  const states: Record<string, number> = {
    NEW: 8,
    HITS_RUNNING: 28,
    HITS_COMPLETE: 48,
    SCREENING_RUNNING: 67,
    SCREENING_COMPLETE: 84,
    INTAKE_INPUT_CREATED: 100,
  };

  return states[pkg.status] ?? 0;
}

function actionLabel(status: string, running: boolean) {
  if (running) return "Running…";
  if (status === "INTAKE_INPUT_CREATED") return "View Output";
  if (status === "SCREENING_COMPLETE") return "Generate Output";
  return "Run Workflow";
}

function formatDate(value?: string) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function WorkflowTable({
  packages,
  runningPackage,
  onOpenPackage,
  onRunWorkflow,
}: WorkflowTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Package</th>
            <th>PMID</th>
            <th>Article</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Hits</th>
            <th>Screening</th>
            <th>Output</th>
            <th>Updated</th>
            <th aria-label="Workflow action">Action</th>
          </tr>
        </thead>

        <tbody>
          {packages.map((pkg) => {
            const running = runningPackage === pkg.package_id;
            const progress = progressFor(pkg);

            return (
              <tr key={pkg.package_id} onClick={() => onOpenPackage(pkg.package_id)}>
                <td className="package-id">{pkg.package_id}</td>
                <td>{pkg.pmid || "—"}</td>
                <td className="article-title">
                  <strong>{pkg.title || "Untitled evidence package"}</strong>
                  <small>Literature evidence package</small>
                </td>
                <td>
                  <span className={`status ${pkg.status.toLowerCase()}`}>
                    {STATUS_LABELS[pkg.status] || pkg.status}
                  </span>
                </td>
                <td>
                  <div className="progress">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <small>{progress}%</small>
                </td>
                <td>{pkg.hits_count || 0}</td>
                <td>{pkg.screening_count || 0}</td>
                <td>{pkg.intake_input_count || 0}</td>
                <td>{formatDate(pkg.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    disabled={running}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (pkg.status === "INTAKE_INPUT_CREATED") {
                        onOpenPackage(pkg.package_id);
                        return;
                      }

                      onRunWorkflow(pkg.package_id);
                    }}
                  >
                    {actionLabel(pkg.status, running)}
                  </button>
                </td>
              </tr>
            );
          })}

          {packages.length === 0 && (
            <tr>
              <td colSpan={10} className="empty">
                No evidence packages match the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <style jsx>{`
        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1180px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 14px 16px;
          border-bottom: 1px solid #e8eef5;
          text-align: left;
          vertical-align: middle;
          font-size: 12px;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 1;
          color: #64748b;
          background: #f8fafc;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        tbody tr {
          cursor: pointer;
          transition: 140ms ease;
        }

        tbody tr:hover {
          background: #f8fbff;
        }

        .package-id {
          max-width: 190px;
          color: #1e3a8a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          font-weight: 800;
          word-break: break-word;
        }

        .article-title {
          min-width: 250px;
        }

        .article-title strong,
        .article-title small {
          display: block;
        }

        .article-title strong {
          max-width: 330px;
          overflow: hidden;
          color: #0f172a;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .article-title small {
          margin-top: 4px;
          color: #94a3b8;
          font-size: 10px;
        }

        .status {
          display: inline-flex;
          padding: 6px 9px;
          border-radius: 999px;
          color: #475569;
          background: #eef2f7;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.035em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .status.hits_running,
        .status.screening_running {
          color: #075985;
          background: #e0f2fe;
        }

        .status.hits_complete {
          color: #155e75;
          background: #cffafe;
        }

        .status.screening_complete {
          color: #6b21a8;
          background: #f3e8ff;
        }

        .status.intake_input_created {
          color: #166534;
          background: #dcfce7;
        }

        .progress {
          width: 100px;
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e2e8f0;
        }

        .progress div {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #1d4ed8, #38bdf8);
        }

        td small {
          display: inline-block;
          margin-top: 4px;
          color: #64748b;
        }

        button {
          border: 0;
          border-radius: 10px;
          padding: 8px 11px;
          color: #ffffff;
          background: #1d4ed8;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        button:hover:not(:disabled) {
          background: #1e40af;
        }

        button:disabled {
          cursor: wait;
          opacity: 0.55;
        }

        .empty {
          padding: 36px;
          color: #64748b;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
