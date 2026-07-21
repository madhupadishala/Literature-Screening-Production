"use client";

import { useState } from "react";
import AssignUserModal from "./AssignUserModal";
import styles from "./super-user.module.css";
import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type { PackageAssignment } from "@/lib/super-user/assignment-store";

type PackageAssignmentPanelProps = {
  packageId: string;
  tenantId?: string;
};

type AssignmentsResponse = {
  ok: boolean;
  data: PackageAssignment[];
};

export default function PackageAssignmentPanel({
  packageId,
  tenantId = "TENANT-CLINIXAI",
}: PackageAssignmentPanelProps) {
  const [assignments, setAssignments] = useState<PackageAssignment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  async function loadAssignments() {
    const response = await fetch(
      `/api/super-user/packages/assign?packageId=${encodeURIComponent(
        packageId,
      )}`,
      { cache: "no-store" },
    );

    const data: AssignmentsResponse = await response.json();

    if (data.ok) {
      setAssignments(data.data);
    }
  }

  useDeferredLoad(loadAssignments, packageId);

  const currentAssignment =
    assignments.find((assignment) => assignment.isCurrent) ?? null;

  return (
    <section className={styles.assignmentPanel}>
      <div className={styles.assignmentHeader}>
        <div>
          <p>Assignment</p>
          <h2>Package Ownership</h2>
          <span>{packageId}</span>
        </div>

        <button onClick={() => setModalOpen(true)}>
          {currentAssignment ? "Reassign" : "Assign"}
        </button>
      </div>

      <div className={styles.currentAssignmentCard}>
        <span>Current Assignee</span>

        {currentAssignment ? (
          <>
            <strong>{currentAssignment.assignedToName}</strong>
            <small>
              Assigned by {currentAssignment.assignedBy} ·{" "}
              {formatDate(currentAssignment.assignedAt)}
            </small>
            <p>{currentAssignment.reason}</p>
          </>
        ) : (
          <>
            <strong>Unassigned</strong>
            <small>No active owner found for this package.</small>
          </>
        )}
      </div>

      <div className={styles.assignmentHistory}>
        <div className={styles.sectionTitle}>
          <h3>Assignment History</h3>
          <span>{assignments.length}</span>
        </div>

        {assignments.map((assignment) => (
          <article key={assignment.id} className={styles.assignmentHistoryItem}>
            <div>
              <strong>{assignment.assignedToName}</strong>
              {assignment.isCurrent ? <span>Current</span> : null}
            </div>
            <p>{assignment.reason}</p>
            <small>
              {assignment.assignedBy} · {formatDate(assignment.assignedAt)}
            </small>
          </article>
        ))}
      </div>

      <AssignUserModal
        open={modalOpen}
        packageId={packageId}
        tenantId={tenantId}
        onClose={() => setModalOpen(false)}
        onAssigned={loadAssignments}
      />
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
