import { NEXUS_ENVIRONMENTS, type NexusEnvironment } from "./entitlement-types";
import { NEXUS_MODULES, type NexusModuleKey } from "./modules";

/** Flat /api/context/current data contract shared by server and browser consumers. */
export interface WorkspaceContextData {
  tenantId: string;
  tenantKey: string;
  workspaceId: string;
  workspaceName: string;
  moduleKey: NexusModuleKey;
  environment: NexusEnvironment;
  displayName: string;
  email: string;
  roleKey: string;
  enabledModules: NexusModuleKey[];
}

export type WorkspaceContextResponse = { success: true; data: WorkspaceContextData };

export function isWorkspaceContextData(value: unknown): value is WorkspaceContextData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  const keys = ["tenantId", "tenantKey", "workspaceId", "workspaceName", "moduleKey", "environment", "displayName", "email", "roleKey"];
  const modules: readonly unknown[] = Object.values(NEXUS_MODULES);
  return keys.every(key => typeof data[key] === "string" && (data[key] as string).trim().length > 0)
    && (NEXUS_ENVIRONMENTS as readonly unknown[]).includes(data.environment)
    && modules.includes(data.moduleKey)
    && Array.isArray(data.enabledModules)
    && data.enabledModules.every(key => modules.includes(key))
    && data.enabledModules.includes(data.moduleKey);
}

export function isWorkspaceContextResponse(value: unknown): value is WorkspaceContextResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return response.success === true && isWorkspaceContextData(response.data);
}
