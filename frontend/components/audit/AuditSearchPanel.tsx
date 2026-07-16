"use client";

import { useState } from "react";
import styles from "./audit.module.css";
import type {
  AuditAction,
  AuditModule,
  AuditSearchFilters,
  AuditSeverity,
} from "@/lib/audit/audit-types";

type AuditSearchPanelProps = {
  onSearch: (filters: AuditSearchFilters) => void;
};

const modules: Array<AuditModule | "ALL"> = [
  "ALL",
  "LITERATURE",
  "MICC",
  "REGULATORY",
  "CLINICAL_TRIAL",
  "LEGAL",
  "SOCIAL_MEDIA",
  "ADMIN",
  "SYSTEM",
];

const actions: Array<AuditAction | "ALL"> = [
  "ALL",
  "CREATED",
  "UPDATED",
  "DELETED",
  "VIEWED",
  "ASSIGNED",
  "REASSIGNED",
  "LOCKED",
  "UNLOCKED",
  "ROUTED",
  "ROUTED_BACK",
  "OVERRIDDEN",
  "APPROVED",
  "REJECTED",
  "EXPORTED",
  "LOGIN",
  "LOGOUT",
  "SYSTEM_EVENT",
];

const severities: Array<AuditSeverity | "ALL"> = [
  "ALL",
  "INFO",
  "WARNING",
  "CRITICAL",
];

export default function AuditSearchPanel({ onSearch }: AuditSearchPanelProps) {
  const [filters, setFilters] = useState<AuditSearchFilters>({
    module: "ALL",
    action: "ALL",
    severity: "ALL",
    tenantId: "TENANT-CLINIXAI",
  });

  function updateFilter<K extends keyof AuditSearchFilters>(
    key: K,
    value: AuditSearchFilters[K],
  ) {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function submitSearch() {
    onSearch(filters);
  }

  function resetSearch() {
    const defaultFilters: AuditSearchFilters = {
      module: "ALL",
      action: "ALL",
      severity: "ALL",
      tenantId: "TENANT-CLINIXAI",
    };

    setFilters(defaultFilters);
    onSearch(defaultFilters);
  }

  return (
    <section className={styles.searchPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p>Enterprise Audit Framework</p>
          <h2>Audit Search</h2>
        </div>

        <div className={styles.panelActions}>
          <button onClick={resetSearch}>Reset</button>
          <button onClick={submitSearch}>Search</button>
        </div>
      </div>

      <div className={styles.filterGrid}>
        <label>
          Search
          <input
            value={filters.search ?? ""}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search title, entity, user or description..."
          />
        </label>

        <label>
          Package ID
          <input
            value={filters.packageId ?? ""}
            onChange={(event) => updateFilter("packageId", event.target.value)}
            placeholder="PKG-LIT-2026-0001"
          />
        </label>

        <label>
          User ID
          <input
            value={filters.userId ?? ""}
            onChange={(event) => updateFilter("userId", event.target.value)}
            placeholder="USR-000"
          />
        </label>

        <label>
          Tenant ID
          <input
            value={filters.tenantId ?? ""}
            onChange={(event) => updateFilter("tenantId", event.target.value)}
            placeholder="TENANT-CLINIXAI"
          />
        </label>

        <label>
          Module
          <select
            value={filters.module ?? "ALL"}
            onChange={(event) =>
              updateFilter("module", event.target.value as AuditModule | "ALL")
            }
          >
            {modules.map((module) => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </label>

        <label>
          Action
          <select
            value={filters.action ?? "ALL"}
            onChange={(event) =>
              updateFilter("action", event.target.value as AuditAction | "ALL")
            }
          >
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label>
          Severity
          <select
            value={filters.severity ?? "ALL"}
            onChange={(event) =>
              updateFilter(
                "severity",
                event.target.value as AuditSeverity | "ALL",
              )
            }
          >
            {severities.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>

        <label>
          Workflow Stage
          <input
            value={filters.workflowStage ?? ""}
            onChange={(event) =>
              updateFilter("workflowStage", event.target.value)
            }
            placeholder="SCREENING / QC / LOCKED"
          />
        </label>

        <label>
          Date From
          <input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(event) => updateFilter("dateFrom", event.target.value)}
          />
        </label>

        <label>
          Date To
          <input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(event) => updateFilter("dateTo", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}