import type { Permission } from "./permissions";

export interface TenantAccessRecord {
  userId: string;
  email: string;
  displayName: string;
  userStatus: "active" | "disabled";
  roleKey: string;
  customPermissions: Permission[];
  membershipStatus: "active" | "disabled";
  membershipVersion: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface SaveTenantAccessRequest {
  userId?: string;
  email?: string;
  displayName?: string;
  roleKey: string;
  customPermissions?: string[];
  membershipStatus: "active" | "disabled";
  expectedVersion?: number;
  reason: string;
}
