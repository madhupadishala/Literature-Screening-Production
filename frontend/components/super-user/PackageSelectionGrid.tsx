"use client";

import { useEffect, useMemo, useState } from "react";
import BulkActionBar from "./BulkActionBar";
import BulkCommentModal from "./BulkCommentModal";
import styles from "./super-user.module.css";
import type {
  BulkPackage,
  BulkPackageAction,
} from "@/lib/super-user/bulk-action-store";

type BulkPackagesResponse = {
  ok: boolean;
  data: BulkPackage[];
};

type PackageSelectionGridProps = {
  tenantId?: string;
};

const pageSize = 10;

export default function PackageSelectionGrid({
  tenantId = "TENANT-CLINIXAI",
}: PackageSelectionGridProps) {
  const [packages, setPackages] = useState<BulkPackage[]>([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [bulkAction, setBulkAction] = useState<BulkPackageAction | null>(null);

  async function loadPackages() {
    const response = await fetch(
      `/api/super-user/packages/bulk-action?tenantId=${encodeURIComponent(
        tenantId,
      )}`,
      { cache: "no-store" },
    );

    const data: BulkPackagesResponse = await response.json();

    if (data.ok) {
      setPackages(data.data);
    }
  }

  useEffect(() => {
    loadPackages();
  }, [tenantId]);

  const filteredPackages = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return packages.filter((item) => {
      const searchMatch =
        !normalizedSearch ||
        item.id.toLowerCase().includes(normalizedSearch) ||
        item.packageName.toLowerCase().includes(normalizedSearch) ||
        item.product.toLowerCase().includes(normalizedSearch) ||
        item.assignedTo.toLowerCase().includes(normalizedSearch);

      const statusMatch =
        statusFilter === "ALL" || item.status === statusFilter;

      return searchMatch && statusMatch;
    });
  }, [packages, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPackages.length / pageSize));

  const visiblePackages = filteredPackages.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  function togglePackage(packageId: string) {
    setSelectedPackageIds((current) =>
      current.includes(packageId)
        ? current.filter((item) => item !== packageId)
        : [...current, packageId],
    );
  }

  function toggleAllVisible() {
    const visibleIds = visiblePackages.map((item) => item.id);
    const allVisibleSelected = visibleIds.every((id) =>
      selectedPackageIds.includes(id),
    );

    if (allVisibleSelected) {
      setSelectedPackageIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
    } else {
      setSelectedPackageIds((current) =>
        Array.from(new Set([...current, ...visibleIds])),
      );
    }
  }

  function openBulkModal(action: BulkPackageAction) {
    setBulkAction(action);
  }

  function clearSelection() {
    setSelectedPackageIds([]);
  }

  async function handleBulkComplete() {
    clearSelection();
    await loadPackages();
  }

  return (
    <section className={styles.packageGridCard}>
      <div className={styles.packageGridHeader}>
        <div>
          <p>Bulk Package Operations</p>
          <h2>Package Selection Grid</h2>
        </div>

        <div className={styles.packageGridFilters}>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search package, product, assignee..."
          />

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="HITS">Hits</option>
            <option value="SCREENING">Screening</option>
            <option value="LOCKED">Locked</option>
            <option value="COMPLETED">Completed</option>
            <option value="UNLOCKED">Unlocked</option>
            <option value="ROUTED_BACK">Routed Back</option>
            <option value="OVERRIDDEN">Overridden</option>
          </select>
        </div>
      </div>

      <BulkActionBar
        selectedCount={selectedPackageIds.length}
        onAction={openBulkModal}
        onClear={clearSelection}
      />

      <div className={styles.selectionTableWrap}>
        <table className={styles.selectionTable}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    visiblePackages.length > 0 &&
                    visiblePackages.every((item) =>
                      selectedPackageIds.includes(item.id),
                    )
                  }
                  onChange={toggleAllVisible}
                />
              </th>
              <th>Package ID</th>
              <th>Package Name</th>
              <th>Product</th>
              <th>Status</th>
              <th>Assigned To</th>
            </tr>
          </thead>

          <tbody>
            {visiblePackages.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedPackageIds.includes(item.id)}
                    onChange={() => togglePackage(item.id)}
                  />
                </td>
                <td>{item.id}</td>
                <td>{item.packageName}</td>
                <td>{item.product}</td>
                <td>
                  <span className={styles.statusBadge}>{item.status}</span>
                </td>
                <td>{item.assignedTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <button
          disabled={page === 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </button>

        <span>
          Page {page} of {totalPages}
        </span>

        <button
          disabled={page === totalPages}
          onClick={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
        >
          Next
        </button>
      </div>

      <BulkCommentModal
        open={Boolean(bulkAction)}
        action={bulkAction}
        selectedPackageIds={selectedPackageIds}
        tenantId={tenantId}
        onClose={() => setBulkAction(null)}
        onComplete={handleBulkComplete}
      />
    </section>
  );
}