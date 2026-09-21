# Nexus Architecture Decision Log

## DEC-001 — Nexus is a modular platform
**Status:** Approved

Nexus is one platform with tenant-scoped commercial modules. Literature, Intake and Case Processing are not separate codebases.

## DEC-002 — Entitlement and RBAC are separate controls
**Status:** Approved

A tenant must be entitled to a module and a user must hold the required permission. Neither condition alone grants access.

## DEC-003 — Authorization is fail-closed
**Status:** Approved

Missing, disabled, suspended or expired entitlements deny module access. Direct URL/API access must not bypass entitlement enforcement.

## DEC-004 — Environments are explicit authorization context
**Status:** Approved

Module entitlements are stored independently for PROD, UAT and TRAINING.

## DEC-005 — Case Processing depends on Intake
**Status:** Approved

The Nexus Case Processing module can only be effectively enabled when Intake is enabled for the same tenant and environment.

## DEC-006 — Existing Literature access is preserved during migration
**Status:** Approved

Migration 021 enables Literature for existing tenants across controlled environments. All new modules remain disabled until deliberately activated.

## DEC-007 — Entitlement changes are versioned and audited
**Status:** Approved

Every entitlement change requires a reason, records the prior version, and writes an audit event.

## DEC-008 — Regulated module access is not a UI-only control
**Status:** Approved

Navigation filtering is convenience only. Server-side API/workflow authorization remains authoritative.

## DEC-009 — Platform RBAC is separate from tenant RBAC
**Status:** Approved

TheClinixAI Control Plane authority is stored in `platform_role_assignments`, independently of a user's role inside any customer tenant. Client Admin/Owner roles cannot activate commercial modules.

## DEC-010 — Commercial entitlement management is cross-tenant Control Plane work
**Status:** Approved

Clients may read their own licensed modules. TheClinixAI platform-authorized users may inspect and change a target tenant's entitlements through the platform API with a mandatory change reason and audit history. Platform administrators do not need to become operational members of every client tenant to manage licensing.
