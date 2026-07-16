export type ClinixRole =
  | "ClinixAI Super Admin"
  | "Client Admin"
  | "Super User"
  | "QC Reviewer"
  | "Read Only / Auditor / Training";

export const ROLE_PERMISSIONS: Record<ClinixRole, string[]> = {
  "ClinixAI Super Admin": [
    "dashboard.view",
    "workflow.view",
    "workflow.run",
    "package.view",
    "package.assign",
    "package.unlock",
    "package.lock",
    "package.override",
    "package.route_back",
    "package.force_rerun",
    "package.download",
    "admin.view",
    "admin.users",
    "admin.products",
    "admin.knowledge",
    "admin.system",
    "tenant.manage",
  ],

  "Client Admin": [
    "dashboard.view",
    "workflow.view",
    "workflow.run",
    "package.view",
    "package.assign",
    "package.unlock",
    "package.lock",
    "package.override",
    "package.route_back",
    "package.download",
    "admin.view",
    "admin.users",
    "admin.products",
    "admin.knowledge",
    "tenant.configure",
  ],

  "Super User": [
    "dashboard.view",
    "workflow.view",
    "workflow.run",
    "package.view",
    "package.assign",
    "package.unlock",
    "package.lock",
    "package.override",
    "package.route_back",
    "package.force_rerun",
    "package.download",
    "admin.view",
  ],

  "QC Reviewer": [
    "dashboard.view",
    "workflow.view",
    "package.view",
    "package.download",
    "hits.review",
    "screening.review",
  ],

  "Read Only / Auditor / Training": [
    "dashboard.view",
    "workflow.view",
    "package.view",
    "package.download",
  ],
};

export function getPermissions(role: ClinixRole) {
  return ROLE_PERMISSIONS[role] || [];
}

export function can(role: ClinixRole, permission: string) {
  return getPermissions(role).includes(permission);
}