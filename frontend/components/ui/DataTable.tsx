import type { Key, ReactNode } from "react";

import { Button } from "./Button";
import { Notice } from "./Notice";
import styles from "./primitives.module.css";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type TableStatus = "loading" | "ready" | "error" | "readonly" | "finalized";

export type DataTableProps<T> = {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => Key;
  status?: TableStatus;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  onRetry?: () => void;
  readOnly?: boolean;
  finalized?: boolean;
  owner?: string;
  lockReason?: string;
  auditReference?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  status = "ready",
  loading = false,
  error,
  emptyMessage = "No records match the current filters.",
  emptyAction,
  onRetry,
  readOnly = false,
  finalized = false,
  owner,
  lockReason,
  auditReference,
}: DataTableProps<T>) {
  const state = loading
    ? "loading"
    : error
      ? "error"
      : finalized
        ? "finalized"
        : readOnly
          ? "readonly"
          : status;

  if (state === "loading") {
    return (
      <div className={styles.statePanel} data-table-state="loading" aria-busy="true">
        <span className={styles.stateHeading}>Loading records</span>
        <div className={styles.skeleton} aria-hidden="true" />
        <div className={styles.skeleton} aria-hidden="true" />
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div data-table-state="error">
        <Notice tone="error">
          <p>{error ?? "The records could not be loaded."}</p>
          {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
        </Notice>
      </div>
    );
  }

  const locked = state === "readonly" || state === "finalized";

  return (
    <section data-table-state={rows.length ? state : "empty"}>
      {state === "readonly" ? (
        <Notice>
          <strong>Read-only · Editing locked</strong>
          <p>{lockReason ?? "Another authorized reviewer owns this edit lease."}</p>
          <p>Owner: {owner ?? "Unknown"}</p>
        </Notice>
      ) : null}
      {state === "finalized" ? (
        <Notice tone="success">
          <strong>Finalized · Immutable record</strong>
          <p>Audit reference: {auditReference ?? "Not provided"}</p>
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <div className={styles.statePanel} data-table-empty="true">
          <strong>No records found</strong>
          <p>{emptyMessage}</p>
          {emptyAction ? (
            <Button variant="secondary" onClick={emptyAction.onClick}>
              {emptyAction.label}
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className={styles.tableViewport}
          data-readonly={locked || undefined}
          data-finalized={state === "finalized" || undefined}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column.key} scope="col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={rowKey(row)}>
                  {columns.map(column => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default DataTable;
