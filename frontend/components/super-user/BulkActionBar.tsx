"use client";

import styles from "./super-user.module.css";
import type { BulkPackageAction } from "@/lib/super-user/bulk-action-store";

type BulkActionBarProps = {
  selectedCount: number;
  onAction: (action: BulkPackageAction) => void;
  onClear: () => void;
};

export default function BulkActionBar({
  selectedCount,
  onAction,
  onClear,
}: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={styles.bulkActionBar}>
      <div>
        <strong>{selectedCount}</strong>
        <span> package(s) selected</span>
      </div>

      <div className={styles.bulkButtons}>
        <button onClick={() => onAction("LOCK")}>Lock</button>
        <button onClick={() => onAction("UNLOCK")}>Unlock</button>
        <button onClick={() => onAction("ROUTE_BACK")}>Route Back</button>
        <button onClick={() => onAction("OVERRIDE")}>Override</button>
        <button onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}