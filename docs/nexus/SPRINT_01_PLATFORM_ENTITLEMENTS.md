# Nexus Sprint 1 — Platform Entitlements and Authorization

## Objective
Create the enforceable foundation that allows one Nexus codebase to provide different licensed module combinations per tenant and environment.

## Scope
- Canonical Nexus module registry.
- Persistent tenant/environment module entitlements.
- Versioned entitlement history.
- Entitlement audit events.
- Module dependency rules.
- Platform entitlement permissions.
- Intake and Case Processing permission vocabulary.
- Server-side module + permission guard.
- Current-context exposure of effective modules.
- Entitlement-aware primary navigation.
- Automated Sprint 1 verification.

## Authorization decision
A regulated module action is allowed only when:
1. the tenant/user principal is active;
2. the requested environment is valid;
3. the tenant is actively entitled to the module;
4. required module dependencies are actively entitled;
5. the user's role/custom permissions allow the action.

## Commercial combinations supported by the model
- Literature only.
- Intake only.
- Literature + Intake.
- Intake + Case Processing.
- Literature + Intake + Case Processing.
- Future modules through the same entitlement model.

## Exit criteria
- Existing Literature tenants remain entitled after migration.
- New modules default to unavailable.
- Client Admin cannot alter commercial entitlements.
- ClinixAI Super Admin can manage entitlements.
- Direct server-side module guard denies missing entitlement even when RBAC permission exists.
- Case Processing is denied when Intake dependency is absent.
- Entitlement changes require reason, history and audit.
- Verification script passes.
