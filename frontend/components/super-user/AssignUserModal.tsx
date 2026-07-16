"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./super-user.module.css";
import type {
  AssignableUser,
  AssignmentRole,
} from "@/lib/super-user/assignment-store";

type AssignUserModalProps = {
  open: boolean;
  packageId: string;
  tenantId?: string;
  onClose: () => void;
  onAssigned?: () => void;
};

type UsersResponse = {
  ok: boolean;
  data: AssignableUser[];
};

const roleOptions: Array<{
  label: string;
  value: AssignmentRole | "ALL";
}> = [
  { label: "All Roles", value: "ALL" },
  { label: "Hits", value: "HITS_USER" },
  { label: "Screening", value: "SCREENING_USER" },
  { label: "Intake", value: "INTAKE_USER" },
  { label: "QC", value: "QC_USER" },
  { label: "Workflow Manager", value: "WORKFLOW_MANAGER" },
];

export default function AssignUserModal({
  open,
  packageId,
  tenantId = "TENANT-CLINIXAI",
  onClose,
  onAssigned,
}: AssignUserModalProps) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<AssignmentRole | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [availabilityOnly, setAvailabilityOnly] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    async function loadUsers() {
      const params = new URLSearchParams();
      params.set("tenantId", tenantId);
      params.set("availabilityOnly", String(availabilityOnly));

      if (role !== "ALL") {
        params.set("role", role);
      }

      const response = await fetch(`/api/super-user/users?${params.toString()}`);
      const data: UsersResponse = await response.json();

      if (data.ok) {
        setUsers(data.data);
      }
    }

    loadUsers();
  }, [open, tenantId, role, availabilityOnly]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      if (!normalizedSearch) return true;

      return (
        user.name.toLowerCase().includes(normalizedSearch) ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        user.role.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [users, search]);

  async function handleAssign() {
    if (!selectedUserId || !reason.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/super-user/packages/assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packageId,
          tenantId,
          assignedToUserId: selectedUserId,
          assignedBy: "Super User",
          reason,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setSelectedUserId("");
        setReason("");
        onAssigned?.();
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.assignModal}>
        <div className={styles.modalHeader}>
          <div>
            <p>Assignment Engine</p>
            <h2>Assign Package</h2>
            <span>{packageId}</span>
          </div>

          <button onClick={onClose}>Close</button>
        </div>

        <div className={styles.assignmentFilters}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user, email or role..."
          />

          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as AssignmentRole | "ALL")
            }
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label>
            <input
              type="checkbox"
              checked={availabilityOnly}
              onChange={(event) => setAvailabilityOnly(event.target.checked)}
            />
            Available only
          </label>
        </div>

        <div className={styles.userList}>
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              className={
                selectedUserId === user.id
                  ? styles.userCardSelected
                  : styles.userCard
              }
              onClick={() => setSelectedUserId(user.id)}
            >
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>
                {user.role} · {user.status} · {user.activePackages}/
                {user.maxPackages}
              </small>
            </button>
          ))}
        </div>

        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Mandatory assignment / reassignment reason..."
        />

        <div className={styles.modalActions}>
          <button onClick={onClose}>Cancel</button>
          <button
            onClick={handleAssign}
            disabled={!selectedUserId || !reason.trim() || submitting}
          >
            {submitting ? "Assigning..." : "Confirm Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}