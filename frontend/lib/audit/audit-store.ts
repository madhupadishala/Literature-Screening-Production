import type {
  AuditRecord,
  AuditSearchFilters,
  AuditSearchResult,
} from "./audit-types";

const auditRecords: AuditRecord[] = [
  {
    id: "AUD-ENT-0001",
    module: "LITERATURE",
    entityType: "PACKAGE",
    entityId: "PKG-LIT-2026-0001",
    packageId: "PKG-LIT-2026-0001",
    action: "CREATED",
    severity: "INFO",
    title: "Package Created",
    description: "Literature package created for weekly review.",
    performedBy: {
      id: "USR-004",
      name: "Workflow Manager",
      role: "WORKFLOW_MANAGER",
      tenantId: "TENANT-CLINIXAI",
    },
    performedAt: "2026-07-05T08:30:00+05:30",
    workflowStage: "HITS",
    ipAddress: "127.0.0.1",
  },
  {
    id: "AUD-ENT-0002",
    module: "LITERATURE",
    entityType: "WORKFLOW",
    entityId: "PKG-LIT-2026-0001",
    packageId: "PKG-LIT-2026-0001",
    action: "LOCKED",
    severity: "INFO",
    title: "Package Locked",
    description: "Package locked after screening review.",
    performedBy: {
      id: "USR-001",
      name: "Screening User",
      role: "SCREENING_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    performedAt: "2026-07-05T10:10:00+05:30",
    workflowStage: "SCREENING",
    previousValue: "SCREENING",
    newValue: "LOCKED",
    ipAddress: "127.0.0.1",
  },
  {
    id: "AUD-ENT-0003",
    module: "LITERATURE",
    entityType: "WORKFLOW",
    entityId: "PKG-LIT-2026-0001",
    packageId: "PKG-LIT-2026-0001",
    action: "UNLOCKED",
    severity: "WARNING",
    title: "Package Unlocked",
    description: "Package unlocked for correction before QC.",
    performedBy: {
      id: "USR-000",
      name: "Super User",
      role: "SUPER_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    performedAt: "2026-07-05T11:00:00+05:30",
    workflowStage: "LOCKED",
    previousValue: "LOCKED",
    newValue: "SCREENING",
    ipAddress: "127.0.0.1",
  },
  {
    id: "AUD-ENT-0004",
    module: "LITERATURE",
    entityType: "PACKAGE",
    entityId: "PKG-LIT-2026-0001",
    packageId: "PKG-LIT-2026-0001",
    action: "OVERRIDDEN",
    severity: "CRITICAL",
    title: "Expedited Override Applied",
    description: "Manual override applied for hospitalization seriousness.",
    performedBy: {
      id: "USR-003",
      name: "QC Reviewer",
      role: "QC_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    performedAt: "2026-07-05T12:20:00+05:30",
    workflowStage: "QC",
    previousValue: "Non-expedited",
    newValue: "Expedited",
    ipAddress: "127.0.0.1",
  },
  {
    id: "AUD-ENT-0005",
    module: "ADMIN",
    entityType: "SESSION",
    entityId: "SESSION-2026-0001",
    action: "LOGIN",
    severity: "INFO",
    title: "User Login",
    description: "User logged into ClinixAI frontend.",
    performedBy: {
      id: "USR-000",
      name: "Madhu",
      role: "SUPER_USER",
      tenantId: "TENANT-CLINIXAI",
    },
    performedAt: "2026-07-06T05:30:00+05:30",
    ipAddress: "127.0.0.1",
  },
];

export function searchAuditRecords(input: {
  filters?: AuditSearchFilters;
  page?: number;
  pageSize?: number;
}): AuditSearchResult {
  const filters = input.filters ?? {};
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, input.pageSize ?? 10);

  const filtered = auditRecords.filter((record) => {
    const packageMatch =
      !filters.packageId ||
      record.packageId?.toLowerCase().includes(filters.packageId.toLowerCase());

    const userMatch =
      !filters.userId || record.performedBy.id === filters.userId;

    const tenantMatch =
      !filters.tenantId || record.performedBy.tenantId === filters.tenantId;

    const moduleMatch =
      !filters.module || filters.module === "ALL" || record.module === filters.module;

    const actionMatch =
      !filters.action || filters.action === "ALL" || record.action === filters.action;

    const severityMatch =
      !filters.severity ||
      filters.severity === "ALL" ||
      record.severity === filters.severity;

    const workflowMatch =
      !filters.workflowStage ||
      record.workflowStage?.toLowerCase() === filters.workflowStage.toLowerCase();

    const searchText = filters.search?.trim().toLowerCase();

    const textMatch =
      !searchText ||
      record.id.toLowerCase().includes(searchText) ||
      record.title.toLowerCase().includes(searchText) ||
      record.description.toLowerCase().includes(searchText) ||
      record.entityId.toLowerCase().includes(searchText) ||
      record.performedBy.name.toLowerCase().includes(searchText);

    const performedTime = new Date(record.performedAt).getTime();

    const fromMatch =
      !filters.dateFrom || performedTime >= new Date(filters.dateFrom).getTime();

    const toMatch =
      !filters.dateTo || performedTime <= new Date(filters.dateTo).getTime();

    return (
      packageMatch &&
      userMatch &&
      tenantMatch &&
      moduleMatch &&
      actionMatch &&
      severityMatch &&
      workflowMatch &&
      textMatch &&
      fromMatch &&
      toMatch
    );
  });

  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime(),
  );

  const start = (page - 1) * pageSize;
  const records = sorted.slice(start, start + pageSize);

  return {
    total: sorted.length,
    page,
    pageSize,
    records,
  };
}

export function addAuditRecord(record: AuditRecord) {
  auditRecords.unshift(record);
  return record;
}

export function getAuditRecordById(id: string) {
  return auditRecords.find((record) => record.id === id) ?? null;
}