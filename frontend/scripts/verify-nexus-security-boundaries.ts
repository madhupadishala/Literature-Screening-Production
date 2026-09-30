import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  decodeScopedContext,
  encodeScopedContext,
} from "../lib/nexus/context-token-codec";

const secret = "test-secret-that-is-longer-than-thirty-two-characters";
const now = new Date("2026-09-30T00:00:00.000Z");

const valid = encodeScopedContext(
  {
    sessionId: "session-a",
    userId: "user-a",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    environment: "UAT",
    moduleKey: "LITERATURE",
  },
  secret,
  { now, expiresInSeconds: 600 },
);

const decoded = decodeScopedContext(valid, secret, new Date(now.getTime() + 60_000));
assert.equal(decoded?.sessionId, "session-a");
assert.equal(decoded?.tenantId, "tenant-a");
assert.equal(decoded?.workspaceId, "workspace-a");

const [body, sig] = valid.split(".");
const tamperedBody = Buffer.from(
  JSON.stringify({
    ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    tenantId: "tenant-b",
  }),
).toString("base64url");
assert.equal(decodeScopedContext(`${tamperedBody}.${sig}`, secret, now), null);
assert.equal(decodeScopedContext(valid, "different-secret-that-is-also-long-enough-12345", now), null);
assert.equal(decodeScopedContext(valid, secret, new Date(now.getTime() + 601_000)), null);

const expired = encodeScopedContext(
  {
    sessionId: "session-a",
    userId: "user-a",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    environment: "PROD",
    moduleKey: "SUBMISSIONS",
  },
  secret,
  { now, expiresInSeconds: 1 },
);
assert.equal(decodeScopedContext(expired, secret, new Date(now.getTime() + 2_000)), null);

function read(relative: string) {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

const guard = read("lib/rbac/workspace-guard.ts");
assert.ok(guard.includes("context.sessionId !== identity.sessionId"), "Cross-session context replay must be rejected.");
assert.ok(guard.includes("resolveTenantForIdentity"), "Tenant membership must be re-read after context selection.");
assert.ok(guard.includes("evaluateWorkspaceModuleAccess"), "Workspace/module authority must be re-read.");

const legacyPrincipal = read("lib/rbac/request-principal.ts");
assert.ok(legacyPrincipal.includes('process.env.NODE_ENV !== "production"'));
assert.ok(legacyPrincipal.includes("allowTrustedIdentityHeaders"));
assert.ok(
  legacyPrincipal.includes("tenantKey && email && allowTrustedIdentityHeaders()"),
  "Trusted identity headers must be explicitly gated to non-production.",
);

const session = read("lib/auth/identity-session-service.ts");
assert.ok(session.includes('createHash("sha256")'));
assert.ok(session.includes("randomBytes(32)"));
assert.ok(session.includes("token_hash"));
assert.ok(!session.includes("INSERT INTO nexus_identity_sessions (\n       user_id, token,"));

const migration = read("database/migrations/033_nexus_identity_workspace_foundation.sql");
assert.ok(migration.includes("FOREIGN KEY (tenant_id, workspace_id)"));
assert.ok(migration.includes("FOREIGN KEY (tenant_id, workspace_id, user_id)"));
assert.ok(migration.includes("REFERENCES tenant_module_entitlements (tenant_id, environment, module_key)"));

console.log("Nexus Sprint 3 security boundary negative verification passed.");
