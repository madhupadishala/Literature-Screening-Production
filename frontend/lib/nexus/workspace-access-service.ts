import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { type NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { isNexusModuleKey, type NexusModuleKey } from "@/lib/nexus/modules";
import { isPermission, PERMISSIONS, type Permission } from "@/lib/rbac/permissions";

export type NexusWorkspaceRole =
  | "WORKSPACE_ADMIN"
  | "WORKSPACE_MEMBER"
  | "WORKSPACE_AUDITOR";

export type NexusWorkspaceModuleRole =
  | "MODULE_VIEWER"
  | "MODULE_OPERATOR"
  | "MODULE_REVIEWER"
  | "MODULE_QC"
  | "MODULE_MEDICAL_REVIEWER"
  | "MODULE_MANAGER"
  | "MODULE_ADMIN";

export interface AccessibleWorkspace {
  workspaceId: string;
  workspaceKey: string;
  displayName: string;
  workspaceRole: NexusWorkspaceRole;
  modules: Array<{
    moduleKey: NexusModuleKey;
    roleKeys: NexusWorkspaceModuleRole[];
  }>;
}

export interface WorkspaceModuleAccess {
  allowed: boolean;
  reason:
    | "ALLOWED"
    | "WORKSPACE_NOT_FOUND"
    | "WORKSPACE_MEMBERSHIP_DENIED"
    | "TENANT_MODULE_NOT_ENTITLED"
    | "WORKSPACE_MODULE_NOT_ENTITLED"
    | "MODULE_ROLE_NOT_ASSIGNED"
    | "PERMISSION_DENIED";
  workspaceId: string;
  workspaceKey?: string;
  workspaceRole?: NexusWorkspaceRole;
  moduleKey: NexusModuleKey;
  moduleRoles: NexusWorkspaceModuleRole[];
  effectivePermissions: Permission[];
}

const LITERATURE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.SEARCH_EXECUTE,
  PERMISSIONS.SEARCH_EXPORT,
  PERMISSIONS.SEARCH_HISTORY_VIEW,
  PERMISSIONS.EVIDENCE_CREATE,
  PERMISSIONS.HITS_SUBMIT,
  PERMISSIONS.SCREENING_EXECUTE,
  PERMISSIONS.SCREENING_REVIEW,
  PERMISSIONS.REVIEW_VIEW,
  PERMISSIONS.REVIEW_EDIT,
  PERMISSIONS.MEDICAL_REVIEW,
  PERMISSIONS.INTAKE_INPUT_GENERATE,
  PERMISSIONS.INTAKE_INPUT_DOWNLOAD,
  PERMISSIONS.PACKAGE_ACTION_EXECUTE,
  PERMISSIONS.PACKAGE_VIEW,
  PERMISSIONS.VERSIONING_MANAGE,
];

const INTAKE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.INTAKE_VIEW,
  PERMISSIONS.INTAKE_CREATE,
  PERMISSIONS.INTAKE_PROCESS,
  PERMISSIONS.INTAKE_ASSIGN,
  PERMISSIONS.INTAKE_OVERRIDE,
  PERMISSIONS.INTAKE_QC,
  PERMISSIONS.INTAKE_EXPORT,
];

const CASE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.CASE_VIEW,
  PERMISSIONS.CASE_CREATE,
  PERMISSIONS.CASE_PROCESS,
  PERMISSIONS.CASE_ASSIGN,
  PERMISSIONS.CASE_QC,
  PERMISSIONS.CASE_MEDICAL_REVIEW,
  PERMISSIONS.CASE_FINALIZE,
  PERMISSIONS.CASE_EXPORT,
];

const SUBMISSION_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.SUBMISSION_VIEW,
  PERMISSIONS.SUBMISSION_CREATE,
  PERMISSIONS.SUBMISSION_TRANSMIT,
  PERMISSIONS.SUBMISSION_ACKNOWLEDGE,
];

const SIGNAL_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.SIGNAL_VIEW,
  PERMISSIONS.SIGNAL_CREATE,
  PERMISSIONS.SIGNAL_ASSESS,
  PERMISSIONS.SIGNAL_APPROVE,
];

const AGGREGATE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.AGGREGATE_VIEW,
  PERMISSIONS.AGGREGATE_CREATE,
  PERMISSIONS.AGGREGATE_REVIEW,
  PERMISSIONS.AGGREGATE_APPROVE,
  PERMISSIONS.AGGREGATE_EXPORT,
];

const PV_DOCUMENT_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.PV_DOCUMENT_VIEW,
  PERMISSIONS.PV_DOCUMENT_CREATE,
  PERMISSIONS.PV_DOCUMENT_REVIEW,
  PERMISSIONS.PV_DOCUMENT_APPROVE,
  PERMISSIONS.PV_DOCUMENT_EXPORT,
];

function modulePermissions(moduleKey: NexusModuleKey): readonly Permission[] {
  switch (moduleKey) {
    case "LITERATURE":
      return LITERATURE_PERMISSIONS;
    case "INTAKE":
      return INTAKE_PERMISSIONS;
    case "CASE_PROCESSING":
      return CASE_PERMISSIONS;
    case "MEDICAL_REVIEW":
      return [
        PERMISSIONS.MEDICAL_REVIEW,
        PERMISSIONS.CASE_MEDICAL_REVIEW,
        PERMISSIONS.REVIEW_VIEW,
        PERMISSIONS.CASE_VIEW,
      ];
    case "SUBMISSIONS":
      return SUBMISSION_PERMISSIONS;
    case "SIGNAL_MANAGEMENT":
      return SIGNAL_PERMISSIONS;
    case "AGGREGATE_REPORTING":
      return AGGREGATE_PERMISSIONS;
    case "PV_DOCUMENTATION":
      return PV_DOCUMENT_PERMISSIONS;
    default:
      return [];
  }
}

function isReadPermission(permission: Permission): boolean {
  return (
    permission.endsWith(".view") ||
    permission.endsWith(".history.view") ||
    permission.endsWith(".download") ||
    permission.endsWith(".export")
  );
}

function builtInModuleRoleHasPermission(
  moduleKey: NexusModuleKey,
  roleKey: NexusWorkspaceModuleRole,
  permission: Permission,
): boolean {
  const allowedForModule = modulePermissions(moduleKey);
  if (!allowedForModule.includes(permission)) return false;

  if (roleKey === "MODULE_ADMIN" || roleKey === "MODULE_MANAGER") return true;
  if (roleKey === "MODULE_VIEWER") return isReadPermission(permission);

  if (roleKey === "MODULE_MEDICAL_REVIEWER") {
    return (
      isReadPermission(permission) ||
      permission === PERMISSIONS.MEDICAL_REVIEW ||
      permission === PERMISSIONS.CASE_MEDICAL_REVIEW
    );
  }

  if (roleKey === "MODULE_QC") {
    return (
      isReadPermission(permission) ||
      permission === PERMISSIONS.SCREENING_REVIEW ||
      permission === PERMISSIONS.INTAKE_QC ||
      permission === PERMISSIONS.CASE_QC ||
      permission === PERMISSIONS.SIGNAL_ASSESS ||
      permission === PERMISSIONS.AGGREGATE_REVIEW ||
      permission === PERMISSIONS.PV_DOCUMENT_REVIEW
    );
  }

  if (roleKey === "MODULE_REVIEWER") {
    return (
      isReadPermission(permission) ||
      permission === PERMISSIONS.SCREENING_REVIEW ||
      permission === PERMISSIONS.REVIEW_EDIT ||
      permission === PERMISSIONS.INTAKE_PROCESS ||
      permission === PERMISSIONS.CASE_PROCESS
    );
  }

  if (roleKey === "MODULE_OPERATOR") {
    const restrictedPermissions: Permission[] = [
      PERMISSIONS.MEDICAL_REVIEW,
      PERMISSIONS.CASE_MEDICAL_REVIEW,
      PERMISSIONS.INTAKE_QC,
      PERMISSIONS.CASE_QC,
      PERMISSIONS.CASE_FINALIZE,
      PERMISSIONS.SUBMISSION_TRANSMIT,
      PERMISSIONS.SUBMISSION_ACKNOWLEDGE,
      PERMISSIONS.SIGNAL_APPROVE,
      PERMISSIONS.AGGREGATE_APPROVE,
      PERMISSIONS.PV_DOCUMENT_APPROVE,
    ];
    return !restrictedPermissions.includes(permission);
  }

  return false;
}

function activeWindow(
  status: string,
  validFrom: Date | string | null,
  validUntil: Date | string | null,
): boolean {
  if (status !== "enabled") return false;
  const now = Date.now();
  if (validFrom && new Date(validFrom).getTime() > now) return false;
  if (validUntil && new Date(validUntil).getTime() <= now) return false;
  return true;
}

export async function listAccessibleWorkspaces(input: {
  tenantId: string;
  userId: string;
  environment: NexusEnvironment;
}): Promise<AccessibleWorkspace[]> {
  const result = await getPostgresPool().query<{
    workspace_id: string;
    workspace_key: string;
    display_name: string;
    workspace_role: NexusWorkspaceRole;
    module_key: string | null;
    module_role: NexusWorkspaceModuleRole | null;
  }>(
    `SELECT
       w.id AS workspace_id,
       w.workspace_key,
       w.display_name,
       wm.workspace_role,
       wme.module_key,
       wmr.role_key AS module_role
     FROM nexus_workspace_memberships wm
     JOIN nexus_client_workspaces w
       ON w.tenant_id = wm.tenant_id
      AND w.id = wm.workspace_id
     LEFT JOIN nexus_workspace_module_entitlements wme
       ON wme.tenant_id = w.tenant_id
      AND wme.workspace_id = w.id
      AND wme.environment = $3
      AND wme.status = 'enabled'
      AND (wme.valid_from IS NULL OR wme.valid_from <= now())
      AND (wme.valid_until IS NULL OR wme.valid_until > now())
     LEFT JOIN tenant_module_entitlements tme
       ON tme.tenant_id = w.tenant_id
      AND tme.environment = $3
      AND tme.module_key = wme.module_key
      AND tme.status = 'enabled'
      AND (tme.valid_from IS NULL OR tme.valid_from <= now())
      AND (tme.valid_until IS NULL OR tme.valid_until > now())
     LEFT JOIN nexus_workspace_module_roles wmr
       ON wmr.tenant_id = wm.tenant_id
      AND wmr.workspace_id = wm.workspace_id
      AND wmr.user_id = wm.user_id
      AND wmr.environment = $3
      AND wmr.module_key = wme.module_key
      AND wmr.status = 'active'
     WHERE wm.tenant_id = $1
       AND wm.user_id = $2
       AND wm.status = 'active'
       AND w.status = 'active'
       AND (wme.module_key IS NULL OR tme.module_key IS NOT NULL)
     ORDER BY w.display_name, wme.module_key, wmr.role_key`,
    [input.tenantId, input.userId, input.environment],
  );

  const byWorkspace = new Map<string, AccessibleWorkspace>();

  for (const row of result.rows) {
    let workspace = byWorkspace.get(row.workspace_id);
    if (!workspace) {
      workspace = {
        workspaceId: row.workspace_id,
        workspaceKey: row.workspace_key,
        displayName: row.display_name,
        workspaceRole: row.workspace_role,
        modules: [],
      };
      byWorkspace.set(row.workspace_id, workspace);
    }

    if (!row.module_key || !row.module_role || !isNexusModuleKey(row.module_key)) continue;

    let moduleAccess = workspace.modules.find((item) => item.moduleKey === row.module_key);
    if (!moduleAccess) {
      moduleAccess = { moduleKey: row.module_key, roleKeys: [] };
      workspace.modules.push(moduleAccess);
    }
    if (!moduleAccess.roleKeys.includes(row.module_role)) {
      moduleAccess.roleKeys.push(row.module_role);
    }
  }

  return [...byWorkspace.values()];
}

export async function evaluateWorkspaceModuleAccess(input: {
  tenantId: string;
  userId: string;
  workspaceId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  permission?: Permission;
}): Promise<WorkspaceModuleAccess> {
  const result = await getPostgresPool().query<{
    workspace_key: string;
    workspace_status: string;
    workspace_role: NexusWorkspaceRole | null;
    membership_status: string | null;
    tenant_entitlement_status: string | null;
    tenant_valid_from: Date | string | null;
    tenant_valid_until: Date | string | null;
    workspace_entitlement_status: string | null;
    workspace_valid_from: Date | string | null;
    workspace_valid_until: Date | string | null;
    module_role: NexusWorkspaceModuleRole | null;
    custom_permissions: unknown;
  }>(
    `SELECT
       w.workspace_key,
       w.status AS workspace_status,
       wm.workspace_role,
       wm.status AS membership_status,
       tme.status AS tenant_entitlement_status,
       tme.valid_from AS tenant_valid_from,
       tme.valid_until AS tenant_valid_until,
       wme.status AS workspace_entitlement_status,
       wme.valid_from AS workspace_valid_from,
       wme.valid_until AS workspace_valid_until,
       wmr.role_key AS module_role,
       wmr.custom_permissions
     FROM nexus_client_workspaces w
     LEFT JOIN nexus_workspace_memberships wm
       ON wm.tenant_id = w.tenant_id
      AND wm.workspace_id = w.id
      AND wm.user_id = $2
     LEFT JOIN tenant_module_entitlements tme
       ON tme.tenant_id = w.tenant_id
      AND tme.environment = $4
      AND tme.module_key = $5
     LEFT JOIN nexus_workspace_module_entitlements wme
       ON wme.tenant_id = w.tenant_id
      AND wme.workspace_id = w.id
      AND wme.environment = $4
      AND wme.module_key = $5
     LEFT JOIN nexus_workspace_module_roles wmr
       ON wmr.tenant_id = w.tenant_id
      AND wmr.workspace_id = w.id
      AND wmr.user_id = $2
      AND wmr.environment = $4
      AND wmr.module_key = $5
      AND wmr.status = 'active'
     WHERE w.tenant_id = $1
       AND w.id = $3`,
    [input.tenantId, input.userId, input.workspaceId, input.environment, input.moduleKey],
  );

  if (result.rows.length === 0) {
    return {
      allowed: false,
      reason: "WORKSPACE_NOT_FOUND",
      workspaceId: input.workspaceId,
      moduleKey: input.moduleKey,
      moduleRoles: [],
      effectivePermissions: [],
    };
  }

  const first = result.rows[0];
  const moduleRoles = result.rows
    .map((row) => row.module_role)
    .filter((role): role is NexusWorkspaceModuleRole => Boolean(role));

  if (first.workspace_status !== "active" || first.membership_status !== "active") {
    return {
      allowed: false,
      reason: "WORKSPACE_MEMBERSHIP_DENIED",
      workspaceId: input.workspaceId,
      workspaceKey: first.workspace_key,
      workspaceRole: first.workspace_role ?? undefined,
      moduleKey: input.moduleKey,
      moduleRoles,
      effectivePermissions: [],
    };
  }

  if (
    !activeWindow(
      first.tenant_entitlement_status ?? "",
      first.tenant_valid_from,
      first.tenant_valid_until,
    )
  ) {
    return {
      allowed: false,
      reason: "TENANT_MODULE_NOT_ENTITLED",
      workspaceId: input.workspaceId,
      workspaceKey: first.workspace_key,
      workspaceRole: first.workspace_role ?? undefined,
      moduleKey: input.moduleKey,
      moduleRoles,
      effectivePermissions: [],
    };
  }

  if (
    !activeWindow(
      first.workspace_entitlement_status ?? "",
      first.workspace_valid_from,
      first.workspace_valid_until,
    )
  ) {
    return {
      allowed: false,
      reason: "WORKSPACE_MODULE_NOT_ENTITLED",
      workspaceId: input.workspaceId,
      workspaceKey: first.workspace_key,
      workspaceRole: first.workspace_role ?? undefined,
      moduleKey: input.moduleKey,
      moduleRoles,
      effectivePermissions: [],
    };
  }

  if (moduleRoles.length === 0) {
    return {
      allowed: false,
      reason: "MODULE_ROLE_NOT_ASSIGNED",
      workspaceId: input.workspaceId,
      workspaceKey: first.workspace_key,
      workspaceRole: first.workspace_role ?? undefined,
      moduleKey: input.moduleKey,
      moduleRoles,
      effectivePermissions: [],
    };
  }

  const allowedForModule = modulePermissions(input.moduleKey);
  const effectivePermissions = allowedForModule.filter((permission) =>
    result.rows.some((row) => {
      if (!row.module_role) return false;
      const customPermissions = Array.isArray(row.custom_permissions)
        ? row.custom_permissions
            .map(String)
            .filter(isPermission)
            .filter((customPermission) => allowedForModule.includes(customPermission))
        : [];
      return (
        customPermissions.includes(permission) ||
        builtInModuleRoleHasPermission(input.moduleKey, row.module_role, permission)
      );
    }),
  );

  if (input.permission) {
    const permitted = effectivePermissions.includes(input.permission);

    if (!permitted) {
      return {
        allowed: false,
        reason: "PERMISSION_DENIED",
        workspaceId: input.workspaceId,
        workspaceKey: first.workspace_key,
        workspaceRole: first.workspace_role ?? undefined,
        moduleKey: input.moduleKey,
        moduleRoles,
        effectivePermissions,
      };
    }
  }

  return {
    allowed: true,
    reason: "ALLOWED",
    workspaceId: input.workspaceId,
    workspaceKey: first.workspace_key,
    workspaceRole: first.workspace_role ?? undefined,
    moduleKey: input.moduleKey,
    moduleRoles,
    effectivePermissions,
  };
}
