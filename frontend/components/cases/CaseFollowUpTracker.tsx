import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import styles from "./CaseFollowUpTracker.module.css";

export type FollowUpRecord = Record<string, unknown>;
function field(row: FollowUpRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "—";
}
function when(value: string) {
  if (value === "—") return value;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleDateString("en-GB", { timeZone: "UTC" }) : value;
}
export default function CaseFollowUpTracker({ rows }: { rows: FollowUpRecord[] }) {
  const columns: Column<FollowUpRecord>[] = [
    { key: "reference", header: "Reference", render: (r) => field(r, "follow_up_key", "followUpKey", "id") },
    { key: "direction", header: "Direction", render: (r) => field(r, "direction", "follow_up_direction", "source_type") },
    { key: "status", header: "Status", render: (r) => <Badge>{field(r, "status", "follow_up_status")}</Badge> },
    { key: "due", header: "Due", render: (r) => <span>{when(field(r, "due_at", "dueAt", "due_date"))}</span> },
    { key: "link", header: "Linked intake", render: (r) => field(r, "follow_up_intake_record_id", "linked_intake_id", "intake_record_id") },
    { key: "resolution", header: "Resolution", render: (r) => field(r, "resolution", "outcome", "closure_reason") },
  ];
  return (
    <section className={styles.tracker} aria-label="Governed case follow-up tracker">
      <h3>Incoming and outgoing follow-ups</h3>
      <p>Linked source records are read-only here. Creation and resolution remain governed by Intake and Case Processing services.</p>
      <DataTable rows={rows} columns={columns}
        rowKey={(r) => field(r, "id", "followUpId", "follow_up_key")}
        emptyMessage="No linked follow-ups are recorded for this case." />
    </section>
  );
}
