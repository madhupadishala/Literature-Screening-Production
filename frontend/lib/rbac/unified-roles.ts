import "server-only";

import {
  ROLE_PERMISSIONS as TENANT_ROLE_PERMISSIONS_SOURCE,
  type Permission as TenantPermission,
} from "./permissions";
import {
  PLATFORM_ROLE_PERMISSIONS as PLATFORM_ROLE_PERMISSIONS_SOURCE,
  type PlatformPermission,
} from "@/lib/nexus/platform-permissions";
import { type UnifiedPermission, isTenantPermission, isPlatformPermission } from "./unified-permissions";

/**
 * Unified Role Definitions
 *
 * Combines Tenant Roles (14) + Platform Roles (5) with unified permission checking.
 * Roles are namespaced to avoid collisions: "TENANT_" + roleKey, "PLATFORM_" + roleKey
 */

// --- TENANT ROLES (14) ---
export const TENANT_ROLES = {
  CLINIXAI_SUPER_ADMIN: "TENANT_CLINIXAI_SUPER_ADMIN",
  CLIENT_OWNER: "TENANT_CLIENT_OWNER",
  CLIENT_ADMIN: "TENANT_CLIENT_ADMIN",
  CLIENT_IT_ADMIN: "TENANT_CLIENT_IT_ADMIN",
  PV_ADMINISTRATOR: "TENANT_PV_ADMINISTRATOR",
  SUPER_USER: "TENANT_SUPER_USER",
  QUALITY_APPROVER: "TENANT_QUALITY_APPROVER",
  QC_REVIEWER: "TENANT_QC_REVIEWER",
  LITERATURE_REVIEWER: "TENANT_LITERATURE_REVIEWER",
  MEDICAL_REVIEWER: "TENANT_MEDICAL_REVIEWER",
  AUDITOR: "TENANT_AUDITOR",
  SYSTEM_SCHEDULER: "TENANT_SYSTEM_SCHEDULER",
  READ_ONLY: "TENANT_READ_ONLY",
} as const;

export type TenantRoleKey = (typeof TENANT_ROLES)[keyof typeof TENANT_ROLES];

// --- PLATFORM ROLES (5) ---
export const PLATFORM_ROLES = {
  SUPER_ADMIN: "PLATFORM_SUPER_ADMIN",
  SECURITY_ADMIN: "PLATFORM_SECURITY_ADMIN",
  QA_ADMIN: "PLATFORM_QA_ADMIN",
  SUPPORT: "PLATFORM_SUPPORT",
  AUDITOR: "PLATFORM_AUDITOR",
} as const;

export type PlatformRoleKey = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

// --- ALL ROLE KEYS ---
export const ALL_ROLE_KEYS = Object.freeze([
  ...Object.values(TENANT_ROLES),
  ...Object.values(PLATFORM_ROLES),
]);

// --- TENANT ROLE PERMISSIONS (mapped to UnifiedPermission) ---
export const TENANT_ROLE_PERMISSIONS: Record<TenantRoleKey, readonly UnifiedPermission[]> = {
  TENANT_CLINIXAI_SUPER_ADMIN: Object.values(TENANT_ROLE_PERMISSIONS_SOURCE) as unknown as UnifiedPermission[],
  TENANT_CLIENT_OWNER: Object.values(TENANT_ROLE_PERMISSIONS_SOURCE) as unknown as UnifiedPermission[],
  TENANT_CLIENT_ADMIN: Object.values(TENANT_ROLE_PERMISSIONS_SOURCE) as unknown as UnifiedPermission[],

  TENANT_CLIENT_IT_ADMIN: [
    TENANT_ROLE_PERMISSIONS_SOURCE.CLIENT_IT_ADMIN,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_PV_ADMINISTRATOR: [
    TENANT_ROLE_PERMISSIONS_SOURCE.PV_ADMINISTRATOR,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_SUPER_USER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.SUPER_USER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_QUALITY_APPROVER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.QUALITY_APPROVER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_QC_REVIEWER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.QC_REVIEWER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_LITERATURE_REVIEWER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.LITERATURE_REVIEWER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_MEDICAL_REVIEWER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.MEDICAL_REVIEWER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_AUDITOR: [
    TENANT_ROLE_PERMISSIONS_SOURCE.AUDITOR,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_SYSTEM_SCHEDULER: [
    TENANT_ROLE_PERMISSIONS_SOURCE.SYSTEM_SCHEDULER,
  ].flat() as unknown as UnifiedPermission[],

  TENANT_READ_ONLY: [
    TENANT_ROLE_PERMISSIONS_SOURCE.READ_ONLY,
  ].flat() as unknown as UnifiedPermission[],
};

// Build the flattened tenant role permissions from source
function buildTenantRolePermissions(): Record<TenantRoleKey, readonly UnifiedPermission[]> {
  const result: Record<string, UnifiedPermission[]> = {};

  for (const [sourceKey, perms] of Object.entries(TENANT_ROLE_PERMISSIONS_SOURCE)) {
    const unifiedKey = `TENANT_${sourceKey}` as TenantRoleKey;
    result[unifiedKey] = perms.map(p => p as UnifiedPermission);
  }

  return result as Record<TenantRoleKey, readonly UnifiedPermission[]>;
}

export const TENANT_ROLE_PERMISSIONS_MAP = buildTenantRolePermissions();

// --- PLATFORM ROLE PERMISSIONS (mapped to UnifiedPermission) ---
function buildPlatformRolePermissions(): Record<PlatformRoleKey, readonly UnifiedPermission[]> {
  const result: Record<string, UnifiedPermission[]> = {};

  for (const [sourceKey, perms] of Object.entries(PLATFORM_ROLE_PERMISSIONS_SOURCE)) {
    const unifiedKey = `PLATFORM_${sourceKey}` as PlatformRoleKey;
    result[unifiedKey] = perms.map(p => p as UnifiedPermission);
  }

  return result as Record<PlatformRoleKey, readonly UnifiedPermission[]>;
}

export const PLATFORM_ROLE_PERMISSIONS_MAP = buildPlatformRolePermissions();

// --- TYPE GUARDS ---
export function isTenantRoleKey(value: string): value is TenantRoleKey {
  return value.startsWith("TENANT_") && Object.values(TENANT_ROLES).includes(value as TenantRoleKey);
}

export function isPlatformRoleKey(value: string): value is PlatformRoleKey {
  return value.startsWith("PLATFORM_") && Object.values(PLATFORM_ROLES).includes(value as PlatformRoleKey);
}

export function isAnyRoleKey(value: string): boolean {
  return isTenantRoleKey(value) || isPlatformRoleKey(value);
}

// --- ROLE DISPLAY NAMES ---
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  // Tenant
  TENANT_CLINIXAI_SUPER_ADMIN: "ClinixAI Super Admin",
  TENANT_CLIENT_OWNER: "Client Owner",
  TENANT_CLIENT_ADMIN: "Client Admin",
  TENANT_CLIENT_IT_ADMIN: "Client IT Admin",
  TENANT_PV_ADMINISTRATOR: "PV Administrator",
  TENANT_SUPER_USER: "Super User",
  TENANT_QUALITY_APPROVER: "Quality Approver",
  TENANT_QC_REVIEWER: "QC Reviewer",
  TENANT_LITERATURE_REVIEWER: "Literature Reviewer",
  TENANT_MEDICAL_REVIEWER: "Medical Reviewer",
  TENANT_AUDITOR: "Auditor",
  TENANT_SYSTEM_SCHEDULER: "System Scheduler",
  TENANT_READ_ONLY: "Read Only",

  // Platform
  PLATFORM_SUPER_ADMIN: "Platform Super Admin",
  PLATFORM_SECURITY_ADMIN: "Platform Security Admin",
  PLATFORM_QA_ADMIN: "Platform QA Admin",
  PLATFORM_SUPPORT: "Platform Support",
  PLATFORM_AUDITOR: "Platform Auditor",
};

// --- HELPER: Get all permissions for a role (tenant + platform) ---
export function getAllPermissionsForRole(roleKey: string, customPermissions: readonly UnifiedPermission[] = []): readonly UnifiedPermission[] {
  const perms = new Set<UnifiedPermission>();

  // Add custom permissions
  for (const p of customPermissions) perms.add(p);

  // Add tenant role permissions
  if (isTenantRoleKey(roleKey)) {
    const tenantPerms = TENANT_ROLE_PERMISSIONS_MAP[roleKey];
    if (tenantPerms) {
      for (const p of tenantPerms) perms.add(p);
    }
  }

  // Add platform role permissions
  if (isPlatformRoleKey(roleKey)) {
    const platformPerms = PLATFORM_ROLE_PERMISSIONS_MAP[roleKey];
    if (platformPerms) {
      for (const p of platformPerms) perms.add(p);
    }
  }

  return Array.from(perms);
}