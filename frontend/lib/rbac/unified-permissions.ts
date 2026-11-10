import "server-only";

import { PERMISSIONS as TENANT_PERMISSIONS_SOURCE, type Permission as TenantPermission } from "./permissions";
import { PLATFORM_PERMISSIONS as PLATFORM_PERMISSIONS_SOURCE, type PlatformPermission } from "@/lib/nexus/platform-permissions";

/**
 * Unified Permission Enum
 *
 * Single source of truth for ALL permissions across the platform.
 * Combines Tenant RBAC (81 permissions) + Platform RBAC (8 permissions) = 89 total.
 *
 * Naming convention: DOMAIN.ACTION
 * - Tenant permissions: literature.search.execute, intake.view, etc.
 * - Platform permissions: platform.entitlement.view, platform.tenant.manage, etc.
 */

// --- TENANT PERMISSIONS (81) ---
export const TENANT_PERMISSIONS = TENANT_PERMISSIONS_SOURCE;

// --- PLATFORM PERMISSIONS (8) ---
export const PLATFORM_PERMISSIONS = PLATFORM_PERMISSIONS_SOURCE;

// --- UNIFIED PERMISSION ENUM (89) ---
export const UNIFIED_PERMISSIONS = {
  // Tenant permissions (spread from existing)
  ...TENANT_PERMISSIONS,

  // Platform permissions (spread from existing)
  ...PLATFORM_PERMISSIONS,
} as const;

export type UnifiedPermission = (typeof UNIFIED_PERMISSIONS)[keyof typeof UNIFIED_PERMISSIONS];

// Type guards
export function isTenantPermission(value: string): value is TenantPermission {
  return (Object.values(TENANT_PERMISSIONS) as string[]).includes(value);
}

export function isPlatformPermission(value: string): value is PlatformPermission {
  return (Object.values(PLATFORM_PERMISSIONS) as string[]).includes(value);
}

export function isUnifiedPermission(value: string): value is UnifiedPermission {
  return (Object.values(UNIFIED_PERMISSIONS) as string[]).includes(value);
}

// Permission categories for UI/debugging
export const PERMISSION_CATEGORIES = {
  LITERATURE: "literature",
  INTAKE: "intake",
  CASE: "case",
  SUBMISSION: "submission",
  SIGNAL: "signal",
  AGGREGATE: "aggregate",
  PV_DOCUMENT: "pv_document",
  TENANT_CONFIG: "tenant.configuration",
  TENANT_AUDIT: "tenant.audit",
  TENANT_RBAC: "tenant.rbac",
  PLATFORM_RELIABILITY: "platform.reliability",
  PLATFORM_PERFORMANCE: "platform.performance",
  PLATFORM_ENTITLEMENT: "platform.entitlement",
  PLATFORM_SUPER_USER: "platform.super_user",
  PLATFORM_ADMIN: "platform.admin",
  PLATFORM_PACKAGE: "literature.package",
  PLATFORM_STORAGE: "platform.storage",
  PLATFORM_TENANT: "platform.tenant",
  PLATFORM_RELEASE: "platform.release",
  PLATFORM_DATA: "platform.data",
  PLATFORM_VERSIONING: "literature.package.versioning",
  // Platform-only
  PLATFORM_ENTITLEMENT_VIEW: "platform.entitlement.view",
  PLATFORM_ENTITLEMENT_MANAGE: "platform.entitlement.manage",
  PLATFORM_TENANT_PROVISION: "platform.tenant.provision",
  PLATFORM_TENANT_MANAGE: "platform.tenant.manage",
  PLATFORM_SUPPORT_ACCESS: "platform.support.access",
  PLATFORM_VALIDATION_ADMIN: "platform.validation.admin",
  PLATFORM_AUDIT_VIEW: "platform.audit.view",
} as const;

export function getPermissionCategory(permission: UnifiedPermission): string {
  const prefix = permission.split(".")[0];
  switch (prefix) {
    case "literature":
      return "LITERATURE";
    case "intake":
      return "INTAKE";
    case "case":
      return "CASE";
    case "submission":
      return "SUBMISSION";
    case "signal":
      return "SIGNAL";
    case "aggregate":
      return "AGGREGATE";
    case "pv_document":
      return "PV_DOCUMENT";
    case "tenant":
      return "TENANT";
    case "platform":
      return "PLATFORM";
    default:
      return "OTHER";
  }
}

// All permission keys for iteration
export const ALL_UNIFIED_PERMISSIONS = Object.freeze(Object.values(UNIFIED_PERMISSIONS));
export const ALL_TENANT_PERMISSIONS = Object.freeze(Object.values(TENANT_PERMISSIONS));
export const ALL_PLATFORM_PERMISSIONS = Object.freeze(Object.values(PLATFORM_PERMISSIONS));