export type UserRole =
  | "SUPER_ADMIN"
  | "CLIENT_ADMIN"
  | "SUPER_USER"
  | "QC"
  | "AUDITOR"
  | "READ_ONLY";

export type PermissionAction =
  | "tenant.manage"
  | "tenant.view"
  | "hits.create"
  | "hits.view"
  | "hits.assign"
  | "screening.perform"
  | "screening.view"
  | "intake.perform"
  | "intake.view"
  | "qc.perform"
  | "qc.view"
  | "audit.view"
  | "audit.export"
  | "version.create"
  | "version.restore"
  | "bulk.perform"
  | "knowledge.manage"
  | "knowledge.view"
  | "prompt.manage"
  | "rbac.manage";

export const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  CLIENT_ADMIN: "Client Admin",
  SUPER_USER: "Super User",
  QC: "QC",
  AUDITOR: "Auditor",
  READ_ONLY: "Read Only",
};

export const rolePermissionMatrix: Record<UserRole, PermissionAction[]> = {
  SUPER_ADMIN: [
    "tenant.manage",
    "tenant.view",
    "hits.create",
    "hits.view",
    "hits.assign",
    "screening.perform",
    "screening.view",
    "intake.perform",
    "intake.view",
    "qc.perform",
    "qc.view",
    "audit.view",
    "audit.export",
    "version.create",
    "version.restore",
    "bulk.perform",
    "knowledge.manage",
    "knowledge.view",
    "prompt.manage",
    "rbac.manage",
  ],

  CLIENT_ADMIN: [
    "tenant.view",
    "hits.create",
    "hits.view",
    "hits.assign",
    "screening.perform",
    "screening.view",
    "intake.perform",
    "intake.view",
    "qc.perform",
    "qc.view",
    "audit.view",
    "audit.export",
    "version.create",
    "bulk.perform",
    "knowledge.manage",
    "knowledge.view",
    "prompt.manage",
  ],

  SUPER_USER: [
    "tenant.view",
    "hits.create",
    "hits.view",
    "hits.assign",
    "screening.perform",
    "screening.view",
    "intake.perform",
    "intake.view",
    "qc.view",
    "audit.view",
    "version.create",
    "bulk.perform",
    "knowledge.view",
  ],

  QC: [
    "tenant.view",
    "hits.view",
    "screening.view",
    "intake.view",
    "qc.perform",
    "qc.view",
    "audit.view",
    "knowledge.view",
  ],

  AUDITOR: [
    "tenant.view",
    "hits.view",
    "screening.view",
    "intake.view",
    "qc.view",
    "audit.view",
    "audit.export",
    "knowledge.view",
  ],

  READ_ONLY: [
    "tenant.view",
    "hits.view",
    "screening.view",
    "intake.view",
    "qc.view",
    "audit.view",
    "knowledge.view",
  ],
};

export function roleHasPermission(
  role: UserRole,
  permission: PermissionAction
): boolean {
  return rolePermissionMatrix[role]?.includes(permission) ?? false;
}