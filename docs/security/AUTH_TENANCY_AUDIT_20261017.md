# Nexus access-context consolidation — 17 October 2026

Local branch: fix/auth-tenancy-audit-20261017. Based on main 4a24fa66; supersedes the initial hardening-only audit on this branch.

## Root cause

The login page disabled tenant/environment controls on Vercel previews, populated a fixed tenant list, required legacy tenant-first login, and then performed a second identity login for preview context. Runtime configuration supplied a fixed default tenant. Selected branches rewrote DATABASE_URL to an embedded Neon target. TenantSwitcher changed only local storage, while the tenant/config endpoint changed a process-global active tenant without authenticating the caller.

Deleting tenant records would not remove these causes.

## Final implementation

- One identity-first credential handler. /api/auth/session is a compatibility URL for the same GET/POST/DELETE functions as /api/auth/identity. Removed the tenant-first credential export and unused legacy session manager/token service.
- One existing Postgres identity-session service: random opaque bearer, SHA-256 bearer hash at rest, durable expiry/revocation, active user check.
- Login first establishes identity, then presents real tenant memberships. No tenant is silently selected, and missing memberships have an explicit empty state.
- Tenant selection discovers authorized environments, client workspaces, and assigned modules from the existing live membership/entitlement queries. Preview status does not lock the controls or imply clinical environment.
- Scope selection is signed and tied to the identity session. Request principals verify the session, tenant membership, workspace membership, entitlements, and effective permissions. Caller headers cannot override tenant/environment. Invalid environment values return 400.
- Changing tenant clears dependent selections; aborted/stale requests cannot restore old workspace data. The global navigation has a real Switch workspace entry and submits a context change before module navigation.
- Logout clears identity, scoped context, and old access-token cookies. A new login clears previous context.
- DATABASE_URL is used exactly as configured; no branch-driven host/database rewriting. The default environment helper no longer infers UAT from Vercel preview, and login does not use deployment defaults as authority.
- Deleted the mutable tenant-store, default tenant/product seeds, unused legacy tenant/prompt panels, and client-only prompt store. The static demonstration tenant-management page redirects to the real selector. The former presentation-only TenantSwitcher uses the same selector.
- tenant/config GET is authenticated and returns only the selected tenant's Postgres configuration. POST requires platform tenant-management permission, rejects a different tenant ID, validates structured settings, and commits the update and audit in one transaction. Legacy global switch/create/delete methods are removed. No tenant records or regulated data were deleted.
- Evidence-context building requires an explicit tenant/environment and uses Postgres configuration, with no global fallback.

The tenantUi settings namespace stores the former legacy UI configuration under the canonical tenant record. It does not invent Product Master entries or replace canonical product/knowledge module repositories.

## Verification

- node --test frontend/tests/auth/context-selection.test.mjs: 21 passing, zero skipped (Node 24).
- Full frontend TypeScript check passed.
- Targeted ESLint passed.
- Optimized Next.js production build passed, including TypeScript and 80 prerendered pages.
- git diff --check passed.

Tests execute actual identity/session/context handlers, compatibility routing, principal resolution, workspace access evaluation, token verification, and tenant configuration handlers with deterministic mocked credentials/database. They cover two tenants, two authorized environments, client switching, denied environment, foreign workspace, session replay/tampering, revoked membership, logout, independent session-service instances, database outage, configuration authorization, and transactional audit.

Live Postgres/deployment was not exercised. Browser verification was attempted, but no Chromium was installed and the download returned an invalid archive. No browser result is claimed. The code is locally committed; remote publication was not repeated after the earlier approval-review rejection.

## Scope

This change consolidates authentication, access selection, request principals and the global legacy tenant store. It is not a claim that every historical demonstration endpoint/component elsewhere in the repository has been retired, nor a qualification of every PV module. Existing explicit operational bootstrap/repair tooling remains separate from interactive login. Existing sessions require reauthentication onto the canonical identity flow. Existing workspaces and module assignments are required for selection; none are fabricated by login.
