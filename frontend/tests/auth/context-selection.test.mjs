import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const userId = '10000000-0000-4000-8000-000000000001';
const tenantA = '20000000-0000-4000-8000-000000000001';
const tenantB = '20000000-0000-4000-8000-000000000002';
const workspaceA = '30000000-0000-4000-8000-000000000001';
const workspaceB = '30000000-0000-4000-8000-000000000002';
const sessions = new Map();
let revokedMembership = false;
const memberships = new Map([[tenantA, workspaceA], [tenantB, workspaceB]]);
let databaseUnavailable = false;
let platformAdmin = false;
const writes = [];
globalThis.__contextTestPool = { async query(sql, values = []) {
  if (databaseUnavailable) throw new Error('Synthetic database outage');
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) { writes.push(sql); return { rows: [] }; }
  if (sql.includes('UPDATE tenants')) { writes.push('UPDATE'); return { rows: [{ id: values[0] }] }; }
  if (sql.includes('FROM platform_role_assignments')) return { rows: platformAdmin ? [{ user_id: userId, role_key: 'PLATFORM_SUPER_ADMIN', status: 'active' }] : [] };
  if (sql.includes('SELECT id, tenant_key, display_name, configuration')) return { rows: [{ id: values[0], tenant_key: 'tenant-a', display_name: 'Tenant A', configuration: {}, created_at: new Date(), updated_at: new Date() }] };
  if (sql.includes('WITH inserted AS')) {
    const [user_id, token_hash, provider, expires_at] = values;
    const row = { session_id: randomUUID(), user_id, email: 'operator@example.test', display_name: 'Operator', provider, issued_at: new Date(), expires_at, token_hash, status: 'active' };
    sessions.set(token_hash, row); return { rows: [row] };
  }
  if (sql.includes('FROM nexus_identity_sessions s')) {
    const row = sessions.get(values[0]);
    return { rows: row && row.status === 'active' && new Date(row.expires_at) > new Date() ? [row] : [] };
  }
  if (sql.includes('SET last_seen_at')) return { rows: [] };
  if (sql.includes("SET status = 'revoked'")) {
    const row = sessions.get(values[0]); if (row) row.status = 'revoked';
    return { rows: [], rowCount: row ? 1 : 0 };
  }
  if (sql.includes('FROM tenant_memberships m')) {
    const all = [...memberships].map(([tenant_id]) => ({ tenant_id, tenant_key: tenant_id === tenantA ? 'tenant-a' : 'tenant-b', display_name: tenant_id === tenantA ? 'Tenant A' : 'Tenant B', role_key: 'SUPER_USER', permissions: [] }));
    return { rows: revokedMembership ? [] : values.length === 1 ? all : all.filter(row => row.tenant_id === values[1]) };
  }
  if (sql.includes('FROM nexus_workspace_memberships wm')) {
    const [tenantId, , environment] = values;
    const workspaceId = memberships.get(tenantId);
    return { rows: workspaceId && environment !== 'TRAINING' ? [{ workspace_id: workspaceId, workspace_key: 'client', display_name: tenantId === tenantA ? 'Client A' : 'Client B', workspace_role: 'WORKSPACE_MEMBER', module_key: 'LITERATURE', module_role: 'MODULE_OPERATOR' }] : [] };
  }
  if (sql.includes('FROM nexus_client_workspaces w')) {
    const [tenantId, , workspaceId, environment, moduleKey] = values;
    if (memberships.get(tenantId) !== workspaceId) return { rows: [] };
    return { rows: [{ workspace_key: 'client', workspace_status: 'active', workspace_role: 'WORKSPACE_MEMBER', membership_status: 'active',
      tenant_entitlement_status: environment === 'TRAINING' ? 'disabled' : 'enabled', tenant_valid_from: null, tenant_valid_until: null,
      workspace_entitlement_status: 'enabled', workspace_valid_from: null, workspace_valid_until: null,
      module_role: moduleKey === 'LITERATURE' ? 'MODULE_OPERATOR' : null, custom_permissions: [] }] };
  }
  if (sql.includes('INSERT INTO nexus_workspace_access_history') || sql.includes('INSERT INTO audit_events')) { if(sql.includes('TENANT_CONFIGURATION_UPDATED')) writes.push('AUDIT'); return { rows: [] }; }
  throw new Error('Unexpected fixture SQL: ' + sql);
}, async connect() { return { query: this.query, release() {} }; } };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    if (specifier === 'next/server') return { url: new URL('node_modules/next/server.js', root).href, shortCircuit: true };
    if (specifier === '@/lib/database/postgres') return { url: 'data:text/javascript,export const getPostgresPool=()=>globalThis.__contextTestPool;', shortCircuit: true };
    if (specifier === '@/lib/auth/verify-credentials') return { url: `data:text/javascript,export async function verifyIdentityCredentials(email,password){return email==='operator@example.test'&&password==='synthetic-password'?{ok:true,userId:'${userId}',email,displayName:'Operator'}:{ok:false,reason:'invalid_credentials'}}`, shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL(specifier.slice(2) + '.ts', root).href, shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL && new URL(context.parentURL).pathname.endsWith('.ts')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (new URL(url).pathname.endsWith('.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform' }), shortCircuit: true };
    return next(url, context);
  },
});
process.env.SESSION_SECRET = 'synthetic-context-signing-key-'.repeat(3);
const { NextRequest } = await import(new URL('node_modules/next/server.js', root));
const identity = await import(new URL('app/api/auth/identity/route.ts', root));
const alias = await import(new URL('app/api/auth/session/route.ts', root));
const contextRoute = await import(new URL('app/api/nexus/context/route.ts', root));
const { resolveRequestPrincipal } = await import(new URL('lib/rbac/request-principal.ts', root));
const { createNexusContextToken } = await import(new URL('lib/nexus/context-token.ts', root));
const { getDatabaseUrl } = await import(new URL('lib/database/postgres.ts', root));
const { getDefaultNexusEnvironment } = await import(new URL('lib/nexus/runtime-environment.ts', root));
const jar = new Map();
function request(path, body, extraHeaders = {}) {
  return new NextRequest(`https://nexus.example.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: [...jar].map(([key,value]) => `${key}=${value}`).join('; '), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function accept(response) { for (const cookie of response.cookies.getAll()) { if (cookie.value) jar.set(cookie.name, cookie.value); else jar.delete(cookie.name); } }
async function login() {
  const response = await identity.POST(request('/api/auth/identity', { email: 'operator@example.test', password: 'synthetic-password' }));
  assert.equal(response.status, 201); accept(response); return (await response.json()).identity;
}
async function select(tenantId = tenantA, workspaceId = workspaceA, environment = 'UAT') {
  const response = await contextRoute.POST(request('/api/nexus/context', { tenantId, workspaceId, environment, moduleKey: 'LITERATURE' }));
  if (response.status === 200) accept(response); return response;
}
beforeEach(() => { jar.clear(); sessions.clear(); revokedMembership = false; databaseUnavailable = false; platformAdmin = false; writes.length = 0; });
test('compatibility endpoint executes the single identity credential handler', () => {
  assert.equal(alias.POST, identity.POST); assert.equal(alias.GET, identity.GET); assert.equal(alias.DELETE, identity.DELETE);
});
test('identity login returns all real memberships without selecting any tenant', async () => {
  await login(); const response = await identity.GET(request('/api/auth/identity')); const data = await response.json();
  assert.deepEqual(data.tenants.map(item => item.tenantId), [tenantA, tenantB]); assert.equal(jar.has('nexus_scoped_context'), false);
});
test('authorized environments and client workspaces are discovered independently of Vercel', async () => {
  process.env.VERCEL_ENV = 'preview'; await login();
  const response = await contextRoute.GET(request(`/api/nexus/context?tenantId=${tenantB}`));
  const data = await response.json(); assert.equal(response.status, 200);
  assert.deepEqual(data.data.environments.map(item => item.environment), ['PROD', 'UAT']);
  assert.equal(data.data.environments[0].workspaces[0].workspaceId, workspaceB);
  assert.equal(data.data.environment, null);
});
test('switches tenant, client and environment; spoofed headers cannot override scope', async () => {
  await login(); assert.equal((await select()).status, 200);
  let principal = await resolveRequestPrincipal(request('/api/context/current', undefined, { 'x-tenant-id': tenantB, 'x-nexus-environment': 'PROD' }));
  assert.equal(principal.tenantId, tenantA); assert.equal(principal.environment, 'UAT');
  assert.equal((await select(tenantB, workspaceB, 'PROD')).status, 200);
  principal = await resolveRequestPrincipal(request('/api/context/current'));
  assert.equal(principal.tenantId, tenantB); assert.equal(principal.environment, 'PROD');
});
test('cross-tenant workspace substitution and unassigned environment fail closed', async () => {
  await login(); assert.equal((await select(tenantA, workspaceB)).status, 403);
  assert.equal((await select(tenantA, workspaceA, 'TRAINING')).status, 403);
});
test('invalid environment is rejected rather than silently using a default', async () => {
  await login(); const response = await contextRoute.GET(request(`/api/nexus/context?tenantId=${tenantA}&environment=invalid`));
  assert.equal(response.status, 400);
});
test('context requires identity and active tenant membership', async () => {
  assert.equal((await contextRoute.GET(request(`/api/nexus/context?tenantId=${tenantA}`))).status, 401);
  await login(); revokedMembership = true; assert.equal((await select()).status, 403);
});
test('membership revocation invalidates an already selected workspace', async () => {
  await login(); await select(); revokedMembership = true;
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 403);
});
test('context from another session cannot be replayed', async () => {
  const loggedIn = await login(); jar.set('nexus_scoped_context', createNexusContextToken({ sessionId: randomUUID(), userId, tenantId: tenantA,
    workspaceId: workspaceA, environment: 'UAT', moduleKey: 'LITERATURE', sessionExpiresAt: loggedIn.expiresAt }));
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 403);
});
test('logout revokes durable identity and clears every auth/context cookie', async () => {
  await login(); await select(); const oldJar = new Map(jar);
  const response = await alias.DELETE(request('/api/auth/session')); accept(response);
  assert.equal(jar.size, 0);
  for (const [key,value] of oldJar) jar.set(key,value);
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 401);
});
test('new login clears stale context; identity cannot inherit previous tenant', async () => {
  await login(); await select(); await login(); assert.equal(jar.has('nexus_scoped_context'), false);
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 403);
});
test('database outage cannot create a default or demo context', async () => {
  await login(); await select(); databaseUnavailable = true;
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), /Synthetic database outage/);
});
test('preview branch cannot rewrite the configured database or default to a fixed tenant', () => {
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@configured.invalid/nexus';
  process.env.VERCEL_ENV = 'preview'; process.env.VERCEL_GIT_COMMIT_REF = 'preview/wave4';
  delete process.env.NEXUS_DEFAULT_ENVIRONMENT;
  assert.equal(getDatabaseUrl(), process.env.DATABASE_URL); assert.equal(getDefaultNexusEnvironment(), 'PROD');
});

test('identity survives independent service instance with no plaintext bearer storage', async () => {
  const loggedIn = await login();
  const raw = jar.get('nexus_identity_session');
  assert.equal(raw.length, 43);
  assert.ok(!JSON.stringify([...sessions.values()]).includes(raw));
  const service = await import(new URL('lib/auth/identity-session-service.ts?instance=2', root));
  const resolved = await service.resolveIdentitySession(raw);
  assert.equal(resolved.sessionId, loggedIn.sessionId);
});
test('tampered context cannot select an authenticated tenant', async () => {
  await login(); await select();
  const token = jar.get('nexus_scoped_context');
  const [encoded, signature] = token.split('.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()); payload.tenantId = tenantB;
  jar.set('nexus_scoped_context', Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + signature);
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 403);
});
test('expired durable identity invalidates a signed context', async () => {
  await login(); await select(); for (const row of sessions.values()) row.expires_at = new Date(0);
  await assert.rejects(resolveRequestPrincipal(request('/api/context/current')), error => error.statusCode === 401);
});
test('null and malformed selector bodies are rejected', async () => {
  await login(); assert.equal((await contextRoute.POST(request('/api/nexus/context', null))).status, 400);
  assert.equal((await identity.POST(request('/api/auth/identity', null))).status, 400);
});

const tenantConfig = await import(new URL('app/api/tenant/config/route.ts', root));
test('tenant configuration requires identity and returns only the selected tenant', async () => {
  assert.equal((await tenantConfig.GET(request('/api/tenant/config'))).status, 401);
  await login(); await select();
  const response = await tenantConfig.GET(request('/api/tenant/config'));
  const data = await response.json(); assert.equal(response.status, 200);
  assert.equal(data.tenants.length, 1); assert.equal(data.activeTenantId, tenantA);
  assert.deepEqual(data.tenants[0].productMaster, []);
});
test('ordinary members cannot write tenant configuration', async () => {
  await login(); await select();
  assert.equal((await tenantConfig.POST(request('/api/tenant/config', { tenant: { id: tenantA } }))).status, 403);
});
test('platform admin cannot overwrite another tenant through the selected context', async () => {
  await login(); await select(); platformAdmin = true;
  assert.equal((await tenantConfig.POST(request('/api/tenant/config', { tenant: { id: tenantB } }))).status, 403);
  assert.equal(writes.length, 0);
});
test('tenant settings update and audit commit in one transaction', async () => {
  await login(); await select(); platformAdmin = true;
  const current = await (await tenantConfig.GET(request('/api/tenant/config'))).json();
  const response = await tenantConfig.POST(request('/api/tenant/config', { tenant: current.tenants[0] }));
  assert.equal(response.status, 200); assert.deepEqual(writes, ['BEGIN', 'UPDATE', 'AUDIT', 'COMMIT']);
});


const currentContext = await import(new URL('app/api/context/current/route.ts', root));
const contextContract = await import(new URL('lib/nexus/workspace-context-contract.ts', root));
test('current context API and browser validators share the flat contract and private cache headers', async () => {
  await login(); await select();
  const response = await currentContext.GET(request('/api/context/current'));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(contextContract.isWorkspaceContextResponse(payload), true);
  assert.equal(payload.data.email, 'operator@example.test');
  assert.equal(payload.data.workspaceId, workspaceA);
  assert.deepEqual(payload.data.enabledModules, ['LITERATURE']);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal('user' in payload, false);
  for (const patch of [{ workspaceId: '' }, { moduleKey: 'cases' }, { enabledModules: ['submissions'] }, { environment: 'UNKNOWN' }, { enabledModules: [] }]) {
    assert.equal(contextContract.isWorkspaceContextResponse({ ...payload, data: { ...payload.data, ...patch } }), false);
  }
  assert.equal(contextContract.isWorkspaceContextResponse({ success: true, user: { email: 'operator@example.test' } }), false);
});
test('unauthenticated context response is private and never satisfies the ready contract', async () => {
  const response = await currentContext.GET(request('/api/context/current'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(contextContract.isWorkspaceContextResponse(await response.json()), false);
});
