"use client";

import { useState } from "react";

import type { AuditSearchFilters, AuditSeverity } from "@/lib/audit/audit-types";

import styles from "./audit.module.css";

export default function AuditSearchPanel({
  initialFilters,
  loading,
  onSearch,
}: {
  initialFilters: AuditSearchFilters;
  loading: boolean;
  onSearch: (filters: AuditSearchFilters) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);

  function update<K extends keyof AuditSearchFilters>(key: K, value: AuditSearchFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className={styles.searchPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p>Append-only enterprise ledger</p>
          <h2>Audit Search</h2>
        </div>
        <div className={styles.panelActions}>
          <button
            type="button"
            onClick={() => {
              setFilters({ severity: "ALL" });
              onSearch({ severity: "ALL" });
            }}
          >
            Reset
          </button>
          <button type="button" disabled={loading} onClick={() => onSearch(filters)}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      <div className={styles.filterGrid}>
        <label>
          Search
          <input
            value={filters.search || ""}
            onChange={(event) => update("search", event.target.value)}
            placeholder="Event, actor, package or details"
          />
        </label>
        <label>
          Package ID / Key
          <input
            value={filters.packageId || ""}
            onChange={(event) => update("packageId", event.target.value)}
            placeholder="UUID or package key"
          />
        </label>
        <label>
          Event Category
          <input
            value={filters.eventCategory || ""}
            onChange={(event) => update("eventCategory", event.target.value.toUpperCase())}
            placeholder="LITERATURE_SCREENING"
          />
        </label>
        <label>
          Event Type
          <input
            value={filters.eventType || ""}
            onChange={(event) => update("eventType", event.target.value.toUpperCase())}
            placeholder="SCREENING_REVIEW_SAVED"
          />
        </label>
        <label>
          Outcome
          <input
            value={filters.outcome || ""}
            onChange={(event) => update("outcome", event.target.value)}
            placeholder="success"
          />
        </label>
        <label>
          Actor ID
          <input
            value={filters.actorId || ""}
            onChange={(event) => update("actorId", event.target.value)}
            placeholder="User UUID"
          />
        </label>
        <label>
          Severity
          <select
            value={filters.severity || "ALL"}
            onChange={(event) => update("severity", event.target.value as AuditSeverity | "ALL")}
          >
            <option value="ALL">All</option>
            <option value="INFO">Information</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
        <label>
          Date From
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(event) => update("dateFrom", event.target.value)}
          />
        </label>
        <label>
          Date To
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(event) => update("dateTo", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
