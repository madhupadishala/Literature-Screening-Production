import "server-only";

import { type UnifiedPermission } from "./unified-permissions";
export type { UnifiedPermission } from "./unified-permissions";
import { getAllPermissionsForRole, isTenantRoleKey, isPlatformRoleKey, type TenantRoleKey, type PlatformRoleKey } from "./unified-roles";

/**
 * Unified Guard
 *
 * Single permission checker that handles both tenant and platform roles.
 * Replaces the dual-system checks in guard.ts and platform-rbac.ts
 */

export interface UnifiedPrincipal {
  // Tenant context
  tenantId?: string;
  tenantRoleKey?: TenantRoleKey;
  tenantCustomPermissions: readonly UnifiedPermission[];

  // Platform context
  platformRoleKey?: PlatformRoleKey;

  // Unified permission check
  hasPermission: (permission: UnifiedPermission) => boolean;

  // Metadata
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Create a unified principal from tenant + platform role information
 */
export function createUnifiedPrincipal(input: {
  userId: string;
  email: string;
  displayName: string;
  tenantId?: string;
  tenantRoleKey?: string;
  tenantCustomPermissions?: readonly string[];
  platformRoleKey?: string;
}): UnifiedPrincipal {
  const tenantCustomPermissions = (input.tenantCustomPermissions || []).map(p => p as UnifiedPermission);

  // Validate role keys
  const tenantRoleKey = input.tenantRoleKey && isTenantRoleKey(input.tenantRoleKey)
    ? input.tenantRoleKey as TenantRoleKey
    : undefined;

  const platformRoleKey = input.platformRoleKey && isPlatformRoleKey(input.platformRoleKey)
    ? input.platformRoleKey as PlatformRoleKey
    : undefined;

  // Pre-compute all permissions (make mutable copy)
  const allPerms = [...getAllPermissionsForRole(
    tenantRoleKey || "",
    tenantCustomPermissions
  )];

  // Also add platform role permissions if present
  if (platformRoleKey) {
    const platformPerms = getAllPermissionsForRole(platformRoleKey, []);
    allPerms.push(...platformPerms);
  }

  const permSet = new Set<UnifiedPermission>(allPerms);

  return {
    userId: input.userId,
    email: input.email,
    displayName: input.displayName,
    tenantId: input.tenantId,
    tenantRoleKey,
    tenantCustomPermissions,
    platformRoleKey,
    hasPermission: (permission: UnifiedPermission) => permSet.has(permission),
  };
}

/**
 * Check if a principal has a specific permission
 */
export function checkPermission(principal: UnifiedPrincipal, permission: UnifiedPermission): boolean {
  return principal.hasPermission(permission);
}

/**
 * Check if a principal has ANY of the given permissions
 */
export function checkAnyPermission(principal: UnifiedPrincipal, permissions: readonly UnifiedPermission[]): boolean {
  return permissions.some(p => principal.hasPermission(p));
}

/**
 * Check if a principal has ALL of the given permissions
 */
export function checkAllPermissions(principal: UnifiedPrincipal, permissions: readonly UnifiedPermission[]): boolean {
  return permissions.every(p => principal.hasPermission(p));
}

/**
 * Get all permissions for a principal (for debugging/audit)
 */
export function getAllPermissions(principal: UnifiedPrincipal): readonly UnifiedPermission[] {
  return getAllPermissionsForRole(
    principal.tenantRoleKey || "",
    principal.tenantCustomPermissions
  );
}

/**
 * Require a permission - throws if not granted
 */
export function requirePermission(principal: UnifiedPrincipal, permission: UnifiedPermission): void {
  if (!principal.hasPermission(permission)) {
    throw new UnifiedAuthorizationError(`Permission denied: ${permission}`);
  }
}

/**
 * Require any of the given permissions - throws if none granted
 */
export function requireAnyPermission(principal: UnifiedPrincipal, permissions: readonly UnifiedPermission[]): void {
  if (!checkAnyPermission(principal, permissions)) {
    throw new UnifiedAuthorizationError(`Permission denied: requires one of [${permissions.join(", ")}]`);
  }
}

/**
 * Require all of the given permissions - throws if any missing
 */
export function requireAllPermissions(principal: UnifiedPrincipal, permissions: readonly UnifiedPermission[]): void {
  if (!checkAllPermissions(principal, permissions)) {
    throw new UnifiedAuthorizationError(`Permission denied: requires all of [${permissions.join(", ")}]`);
  }
}

export class UnifiedAuthorizationError extends Error {
  constructor(message: string, public readonly statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "UnifiedAuthorizationError";
  }
}

/**
 * Permission scopes for common use cases
 */
export const PERMISSION_SCOPES = {
  // Literature screening
  LITERATURE_READ: [
    "literature.search.execute",
    "literature.search.history.view",
  ] as const,

  LITERATURE_WRITE: [
    "literature.search.execute",
    "literature.search.export",
    "literature.evidence.create",
    "literature.hits.submit",
  ] as const,

  // Screening
  SCREENING_EXECUTE: [
    "literature.screening.execute",
    "literature.screening.review",
  ] as const,

  // Intake
  INTAKE_READ: [
    "intake.view",
    "intake.export",
  ] as const,

  INTAKE_WRITE: [
    "intake.view",
    "intake.create",
    "intake.process",
    "intake.assign",
    "intake.qc",
  ] as const,

  // Case processing
  CASE_READ: [
    "case.view",
    "case.export",
  ] as const,

  CASE_WRITE: [
    "case.view",
    "case.create",
    "case.process",
    "case.assign",
    "case.qc",
    "case.medical_review",
    "case.finalize",
  ] as const,

  // Platform admin
  PLATFORM_ADMIN: [
    "platform.tenant.manage",
    "platform.entitlement.manage",
    "platform.release.manage",
    "platform.admin.settings.manage",
    "platform.super_user.manage",
  ] as const,

  PLATFORM_SUPPORT: [
    "platform.entitlement.view",
    "platform.support.access",
    "platform.tenant.view",
  ] as const,

  PLATFORM_AUDIT: [
    "platform.audit.view",
    "tenant.audit.view",
    "tenant.rbac.view",
  ] as const,
} as const;

/**
 * Helper to check if principal has a permission scope
 */
export function hasScope(principal: UnifiedPrincipal, scope: readonly UnifiedPermission[]): boolean {
  return checkAllPermissions(principal, scope);
}

/**
 * Helper to require a permission scope
 */
export function requireScope(principal: UnifiedPrincipal, scope: readonly UnifiedPermission[]): void {
  requireAllPermissions(principal, scope);
}