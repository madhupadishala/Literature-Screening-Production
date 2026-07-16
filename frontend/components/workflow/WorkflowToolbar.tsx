type WorkflowToolbarProps = {
  searchTerm: string;
  statusFilter: string;
  sortBy: string;
  autoRefresh: boolean;
  resultCount: number;
  totalCount: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
};

const statusOptions = [
  { value: "ALL", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "HITS_RUNNING", label: "Hits Running" },
  { value: "HITS_COMPLETE", label: "Hits Complete" },
  { value: "SCREENING_RUNNING", label: "Screening Running" },
  { value: "SCREENING_COMPLETE", label: "Screening Complete" },
  { value: "INTAKE_INPUT_CREATED", label: "Complete" },
];

const sortOptions = [
  { value: "UPDATED_DESC", label: "Latest Updated" },
  { value: "UPDATED_ASC", label: "Oldest Updated" },
  { value: "TITLE_ASC", label: "Title A-Z" },
  { value: "TITLE_DESC", label: "Title Z-A" },
  { value: "PMID_ASC", label: "PMID A-Z" },
  { value: "PMID_DESC", label: "PMID Z-A" },
];

export default function WorkflowToolbar({
  searchTerm,
  statusFilter,
  sortBy,
  autoRefresh,
  resultCount,
  totalCount,
  onSearchChange,
  onStatusChange,
  onSortChange,
  onAutoRefreshChange,
  onRefresh,
  onClearFilters,
}: WorkflowToolbarProps) {
  const hasFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== "ALL" ||
    sortBy !== "UPDATED_DESC";

  return (
    <section className="workflow-toolbar">
      <div className="toolbar-main">
        <div className="search-box">
          <span>Search</span>
          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search package, PMID, title, product, journal..."
          />
        </div>

        <button className="refresh-button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="toolbar-filters">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sort
          <select value={sortBy} onChange={(event) => onSortChange(event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="auto-refresh">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => onAutoRefreshChange(event.target.checked)}
          />
          Auto refresh
        </label>

        <button
          className="clear-button"
          disabled={!hasFilters}
          onClick={onClearFilters}
        >
          Clear Filters
        </button>

        <div className="result-count">
          Showing <strong>{resultCount}</strong> of <strong>{totalCount}</strong>
        </div>
      </div>

      <style jsx>{`
        .workflow-toolbar {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .toolbar-main {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: end;
        }

        .search-box {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .search-box span,
        label {
          font-size: 12px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .search-box input,
        select {
          width: 100%;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
        }

        .search-box input:focus,
        select:focus {
          border-color: #185a9d;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(24, 90, 157, 0.12);
        }

        .refresh-button,
        .clear-button {
          border: none;
          border-radius: 12px;
          padding: 12px 16px;
          font-weight: 800;
          cursor: pointer;
        }

        .refresh-button {
          background: #185a9d;
          color: #ffffff;
        }

        .clear-button {
          background: #e2e8f0;
          color: #334155;
        }

        .clear-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toolbar-filters {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 220px 220px auto auto 1fr;
          gap: 14px;
          align-items: end;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .auto-refresh {
          flex-direction: row;
          align-items: center;
          gap: 8px;
          height: 44px;
          color: #334155;
          text-transform: none;
          letter-spacing: 0;
        }

        .auto-refresh input {
          width: 16px;
          height: 16px;
        }

        .result-count {
          justify-self: end;
          font-size: 13px;
          color: #64748b;
          padding-bottom: 12px;
        }

        .result-count strong {
          color: #0f172a;
        }

        @media (max-width: 1000px) {
          .toolbar-filters {
            grid-template-columns: repeat(2, 1fr);
          }

          .result-count {
            justify-self: start;
            padding-bottom: 0;
          }
        }

        @media (max-width: 700px) {
          .toolbar-main {
            grid-template-columns: 1fr;
          }

          .toolbar-filters {
            grid-template-columns: 1fr;
          }

          .refresh-button,
          .clear-button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}