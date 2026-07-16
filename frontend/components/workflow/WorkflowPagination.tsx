type WorkflowPaginationProps = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

const pageSizeOptions = [10, 25, 50, 100];

export default function WorkflowPagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  startItem,
  endItem,
  onPageChange,
  onPageSizeChange,
}: WorkflowPaginationProps) {
  if (totalItems === 0) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) =>
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 2
  );

  return (
    <section className="pagination-shell">
      <div className="pagination-info">
        Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of{" "}
        <strong>{totalItems}</strong>
      </div>

      <div className="pagination-controls">
        <label>
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <button
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </button>

        {pages.map((page, index) => {
          const previousPage = pages[index - 1];
          const showGap = previousPage && page - previousPage > 1;

          return (
            <span key={page} className="page-group">
              {showGap && <span className="gap">...</span>}
              <button
                className={page === currentPage ? "active" : ""}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            </span>
          );
        })}

        <button
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>

      <style jsx>{`
        .pagination-shell {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
        }

        .pagination-info {
          color: #64748b;
          font-size: 13px;
        }

        .pagination-info strong {
          color: #0f172a;
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }

        select {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 10px;
          padding: 8px 10px;
          color: #0f172a;
          outline: none;
        }

        button {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 800;
          cursor: pointer;
        }

        button.active {
          background: #185a9d;
          color: #ffffff;
          border-color: #185a9d;
        }

        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .page-group {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .gap {
          color: #94a3b8;
          font-weight: 800;
        }

        @media (max-width: 800px) {
          .pagination-shell {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </section>
  );
}