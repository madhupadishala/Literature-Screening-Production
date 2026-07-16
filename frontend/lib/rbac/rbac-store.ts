import {
  roleHasPermission,
  roleLabels,
  type PermissionAction,
  type UserRole,
} from "./rbac-rules";

export interface CurrentUserContext {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  active: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  role: UserRole;
  permission: PermissionAction;
  reason?: string;
}

let currentUser: CurrentUserContext = {
  id: "user-super-admin",
  name: "ClinixAI Super Admin",
  email: "admin@clinixai.local",
  role: "SUPER_ADMIN",
  tenantId: "tenant-clinixai-default",
  active: true,
};

export function getCurrentUser(): CurrentUserContext {
  return currentUser;
}

export function setCurrentUser(user: CurrentUserContext): CurrentUserContext {
  currentUser = user;
  return currentUser;
}

export function getCurrentUserRole(): UserRole {
  return currentUser.role;
}

export function getCurrentUserRoleLabel(): string {
  return roleLabels[currentUser.role];
}

export function canPerform(permission: PermissionAction): boolean {
  if (!currentUser.active) {
    return false;
  }

  return roleHasPermission(currentUser.role, permission);
}

export function checkPermission(
  permission: PermissionAction
): PermissionCheckResult {
  if (!currentUser.active) {
    return {
      allowed: false,
      role: currentUser.role,
      permission,
      reason: "User account is inactive.",
    };
  }

  const allowed = roleHasPermission(currentUser.role, permission);

  return {
    allowed,
    role: currentUser.role,
    permission,
    reason: allowed
      ? undefined
      : `${roleLabels[currentUser.role]} does not have permission: ${permission}.`,
  };
}