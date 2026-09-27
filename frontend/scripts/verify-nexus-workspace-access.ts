import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const migration = read("database/migrations/033_nexus_workspace_scoped_access.sql");
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_client_workspaces"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_memberships"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_module_entitlements"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_module_roles"));
assert.ok(
  migration.includes("REFERENCES tenant_memberships (tenant_id, user_id)"),
  "Workspace membership must be bounded by active tenant membership data.",
);
assert.ok(
  migration.includes("REFERENCES tenant_module_entitlements (tenant_id, environment, module_key)"),
  "Workspace module entitlement must be a subset of the tenant entitlement surface.",
);
assert.ok(
  migration.includes("FOREIGN KEY (tenant_id, workspace_id, user_id)"),
  "Module roles must be tenant/workspace/user bound.",
);
assert.ok(
  migration.includes("FOREIGN KEY (tenant_id, workspace_id)\n      REFERENCES nexus_client_workspaces"),
  "Audit events must not be able to reference a cross-tenant workspace.",
);

const guard = read("lib/rbac/workspace-guard.ts");
assert.ok(guard.includes("validateNexusContextToken"));
assert.ok(guard.includes("context.userId !== principal.userId"));
assert.ok(guard.includes("context.tenantId !== principal.tenantId"));
assert.ok(guard.includes("context.environment !== principal.environment"));
assert.ok(guard.includes("context.moduleKey !== moduleKey"));
assert.ok(guard.includes("principal.hasPermission(permission)"));
assert.ok(guard.includes("evaluateWorkspaceModuleAccess"));

const contextRoute = read("app/api/nexus/context/route.ts");
assert.ok(contextRoute.includes("httpOnly: true"));
assert.ok(contextRoute.includes('sameSite: "strict"'));
assert.ok(contextRoute.includes("secure: process.env.NODE_ENV === \"production\""));
assert.ok(contextRoute.includes("WORKSPACE_CONTEXT_DENIED"));
assert.ok(contextRoute.includes("WORKSPACE_CONTEXT_SELECTED"));

const workspaceAccess = read("lib/nexus/workspace-access-service.ts");
assert.ok(workspaceAccess.includes("WORKSPACE_MEMBERSHIP_DENIED"));
assert.ok(workspaceAccess.includes("TENANT_MODULE_NOT_ENTITLED"));
assert.ok(workspaceAccess.includes("WORKSPACE_MODULE_NOT_ENTITLED"));
assert.ok(workspaceAccess.includes("MODULE_ROLE_NOT_ASSIGNED"));
assert.ok(workspaceAccess.includes("PERMISSION_DENIED"));

const registry = read("lib/database/migration-registry.ts");
assert.ok(registry.includes('id: "033"'));
assert.ok(registry.includes('filename: "033_nexus_workspace_scoped_access.sql"'));

console.log("Nexus workspace-scoped access verification passed.");
