import type { UserRole } from "./auth-types";

// Maps the DB's tenant_memberships.role_key (the source of truth defined in
// migration 010_enterprise_rbac.sql) down to the UI-facing UserRole used by
// the session/token layer. Anything unrecognized falls back to the
// least-privileged role rather than defaulting upward.
export function mapRoleKeyToUserRole(roleKey: string): UserRole {
  switch (roleKey) {
    case "CLINIXAI_SUPER_ADMIN":
      return "super_admin";
    case "CLIENT_OWNER":
    case "CLIENT_ADMIN":
    case "CLIENT_IT_ADMIN":
    case "PV_ADMINISTRATOR":
      return "client_admin";
    case "SUPER_USER":
    case "QUALITY_APPROVER":
      return "super_user";
    case "QC_REVIEWER":
    case "LITERATURE_REVIEWER":
      return "qc";
    case "AUDITOR":
      return "auditor";
    case "READ_ONLY":
    default:
      return "read_only";
  }
}
