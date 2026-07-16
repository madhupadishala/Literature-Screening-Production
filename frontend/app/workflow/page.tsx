"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./workflow.module.css";
import type {
  WorkflowItem,
  WorkflowStage,
  WorkflowStatus,
  WorkflowSummary,
} from "@/lib/literature/types";

type WorkflowApiResponse = {
  ok: boolean;
  module: string;
  generatedAt: string;
  summary: WorkflowSummary;
  items: WorkflowItem[];
};

const stageLabels: Record<WorkflowStage, string> = {
  HITS: "Hits",
  SCREENING: "Screening",
  INTAKE: "Intake",
  QC: "QC",
  COMPLETED: "Completed",
};

const statusLabels: Record<WorkflowStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  ESCALATED: "Escalated",
  COMPLETED: "Completed",
};

const stageOrder: WorkflowStage[] = [
  "HITS",
  "SCREENING",
  "INTAKE",
  "QC",
  "COMPLETED",
];

export default function WorkflowPage() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [summary, setSummary] = useState<WorkflowSummary | null>(null);
  const [activeStage, setActiveStage] = useState<WorkflowStage | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadWorkflow() {
      try {
        const response = await fetch("/api/workflow/list", {
          cache: "no-store",
        });

        const data: WorkflowApiResponse = await response.json();

        if (data.ok) {
          setItems(data.items);
          setSummary(data.summary);
        }
      } finally {
        setLoading(false);
      }
    }

    loadWorkflow();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const stageMatch = activeStage === "ALL" || item.stage === activeStage;

      const searchMatch =
        normalizedSearch.length === 0 ||
        item.id.toLowerCase().includes(normalizedSearch) ||
        item.articleTitle.toLowerCase().includes(normalizedSearch) ||
        item.product.toLowerCase().includes(normalizedSearch) ||
        item.country.toLowerCase().includes(normalizedSearch) ||
        item.assignedTo.toLowerCase().includes(normalizedSearch);

      return stageMatch && searchMatch;
    });
  }, [items, activeStage, search]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>ClinixAI Literature Screening</p>
          <h1>Workflow Manager</h1>
          <p className={styles.description}>
            Track literature hits through screening, intake, QC, escalation,
            overrides, and expedited seriousness workflows.
          </p>
        </div>

        <div className={styles.heroCard}>
          <span>Environment</span>
          <strong>PROD</strong>
          <small>Session active</small>
        </div>
      </section>

      <section className={styles.metricsGrid}>
        <MetricCard label="Total Items" value={summary?.total ?? 0} />
        <MetricCard label="Hits" value={summary?.hits ?? 0} />
        <MetricCard label="Screening" value={summary?.screening ?? 0} />
        <MetricCard label="Intake" value={summary?.intake ?? 0} />
        <MetricCard label="QC" value={summary?.qc ?? 0} />
        <MetricCard label="Expedited" value={summary?.expedited ?? 0} danger />
        <MetricCard label="Escalated" value={summary?.escalated ?? 0} danger />
        <MetricCard label="Overrides" value={summary?.overrides ?? 0} />
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            className={activeStage === "ALL" ? styles.activeTab : styles.tab}
            onClick={() => setActiveStage("ALL")}
          >
            All
          </button>

          {stageOrder.map((stage) => (
            <button
              key={stage}
              className={activeStage === stage ? styles.activeTab : styles.tab}
              onClick={() => setActiveStage(stage)}
            >
              {stageLabels[stage]}
            </button>
          ))}
        </div>

        <input
          className={styles.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search ID, title, product, country, assignee..."
        />
      </section>

      <section className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2>Active Workflow</h2>
          <span>{filteredItems.length} record(s)</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading workflow records...</div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.emptyState}>No workflow records found.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Article</th>
                  <th>Product</th>
                  <th>Country</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Seriousness</th>
                  <th>Priority</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.idCell}>{item.id}</td>
                    <td>
                      <strong>{item.articleTitle}</strong>
                      <small>{item.source}</small>
                      {item.notes ? <em>{item.notes}</em> : null}
                    </td>
                    <td>{item.product}</td>
                    <td>{item.country}</td>
                    <td>
                      <span className={styles.stageBadge}>
                        {stageLabels[item.stage]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          item.status === "ESCALATED"
                            ? styles.statusDanger
                            : styles.statusBadge
                        }
                      >
                        {statusLabels[item.status]}
                      </span>
                    </td>
                    <td>
                      <div className={styles.seriousnessList}>
                        {item.seriousness.map((seriousness) => (
                          <span key={seriousness}>{seriousness}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          item.priority === "CRITICAL"
                            ? styles.priorityCritical
                            : item.priority === "HIGH"
                              ? styles.priorityHigh
                              : styles.priorityNormal
                        }
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td>{item.assignedTo}</td>
                    <td>{item.dueDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={danger ? styles.metricDanger : styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}