"use client";

import { useState } from "react";
import styles from "./super-user.module.css";
import type { BulkPackageAction } from "@/lib/super-user/bulk-action-store";

type BulkCommentModalProps = {
  open: boolean;
  action: BulkPackageAction | null;
  selectedPackageIds: string[];
  tenantId?: string;
  onClose: () => void;
  onComplete: () => void;
};

export default function BulkCommentModal({
  open,
  action,
  selectedPackageIds,
  tenantId = "TENANT-CLINIXAI",
  onClose,
  onComplete,
}: BulkCommentModalProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open || !action) {
    return null;
  }

  async function executeAction() {
    if (!comment.trim()) return;

    setSubmitting(true);

    try {
      const response = await fetch("/api/super-user/packages/bulk-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageIds: selectedPackageIds,
          tenantId,
          action,
          comment,
          performedBy: "Super User",
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setComment("");
        onComplete();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.assignModal}>
        <div className={styles.modalHeader}>
          <div>
            <p>Bulk Workflow Action</p>
            <h2>{action}</h2>
            <span>{selectedPackageIds.length} package(s) selected</span>
          </div>

          <button onClick={onClose}>Close</button>
        </div>

        <div className={styles.bulkWarning}>
          This action requires a mandatory justification. The comment will be
          saved in audit history for every selected package.
        </div>

        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Enter mandatory justification for this bulk action..."
        />

        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={executeAction}
            disabled={!comment.trim() || submitting}
          >
            {submitting ? "Executing..." : "Confirm Bulk Action"}
          </button>
        </div>
      </div>
    </div>
  );
}