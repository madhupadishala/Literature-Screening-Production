import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const migration = read("database/migrations/033_nexus_identity_workspace_foundation.sql");
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_identity_sessions"));
assert.ok(migration.includes("token_hash text NOT NULL UNIQUE"));
assert.ok(!migration.includes("access_token text"), "Bearer access tokens must not be stored in plaintext.");
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_client_workspaces"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_memberships"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_module_entitlements"));
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS nexus_workspace_module_roles"));
assert.ok(migration.includes("REFERENCES tenant_memberships (tenant_id, user_id)"));
assert.ok(migration.includes("REFERENCES tenant_module_entitlements (tenant_id, environment, module_key)"));
assert.ok(migration.includes("FOREIGN KEY (tenant_id, workspace_id, user_id)"));
assert.ok(migration.includes("ON DELETE RESTRICT"), "Workspace audit/history must not cascade-delete.");

const identityRoute = read("app/api/auth/identity/route.ts");
assert.ok(identityRoute.includes("verifyIdentityCredentials"));
const loginBody = identityRoute.match(/type LoginBody = \{[\s\S]*?\};/u)?.[0] || "";
assert.ok(loginBody.length > 0, "LoginBody must be declared.");
assert.ok(!loginBody.includes("tenantId"), "Identity login body must not accept tenant selection.");
assert.ok(identityRoute.includes("next: \"SELECT_TENANT\""));
assert.ok(identityRoute.includes("httpOnly: true"));
assert.ok(identityRoute.includes('sameSite: "strict"'));

const sessionService = read("lib/auth/identity-session-service.ts");
assert.ok(sessionService.includes("randomBytes(32)"));
assert.ok(sessionService.includes('createHash("sha256")'));
assert.ok(sessionService.includes("nexus_identity_sessions"));
assert.ok(!sessionService.includes("INSERT INTO nexus_identity_sessions (\n       user_id, token,")); 

const context = read("lib/nexus/context-token.ts");
assert.ok(context.includes("sessionId"));
assert.ok(context.includes("tenantId"));
assert.ok(context.includes("workspaceId"));
assert.ok(context.includes("moduleKey"));

const route = read("app/api/nexus/context/route.ts");
assert.ok(route.includes("requireIdentitySession"));
assert.ok(route.includes("resolveTenantForIdentity"));
assert.ok(route.includes("evaluateWorkspaceModuleAccess"));
assert.ok(route.includes("createNexusContextToken"));

const guard = read("lib/rbac/workspace-guard.ts");
assert.ok(guard.includes("context.sessionId !== identity.sessionId"));
assert.ok(guard.includes("resolveTenantForIdentity"));
assert.ok(guard.includes("tenant.hasPermission(permission)"));
assert.ok(guard.includes("evaluateWorkspaceModuleAccess"));

const modules = read("lib/nexus/modules.ts");
assert.ok(modules.includes('SUBMISSIONS: "SUBMISSIONS"'));
assert.ok(modules.includes('PV_DOCUMENTATION: "PV_DOCUMENTATION"'));
const caseBlock = modules.match(/CASE_PROCESSING:\s*\{[\s\S]*?\n\s*\},/u)?.[0] || "";
assert.ok(caseBlock.includes("dependencies: []"), "Case Processing entitlement must not hard-require Intake.");

const registry = read("lib/database/migration-registry.ts");
assert.ok(registry.includes('id: "033"'));
assert.ok(registry.includes('filename: "033_nexus_identity_workspace_foundation.sql"'));

console.log("Nexus identity-first workspace foundation verification passed.");
