# User Guide — Nexus Identity and Scoped Access

Document ID: UG-NEXUS-CORE-001  
Version: 1.0-draft  
Status: Sprint 2 foundation

## 1. Purpose
This guide describes the currently implemented Nexus identity-first access foundation. Module screens will be documented in their respective module User Guides.

## 2. Access sequence
The intended user sequence is:

```text
Login
 -> Select Tenant
 -> Select Client Workspace
 -> Select Environment
 -> Select Module
 -> Work within authorized scope
```

Changing a client workspace or module does not require a new login while the identity session remains active.

## 3. Login
The new identity-first endpoint requires only:
- email
- password

The user does **not** choose a tenant during credential verification.

After successful authentication Nexus returns only tenants where the account has active membership.

## 4. Tenant selection
Choose the organization/tenant you intend to work under. The system rechecks membership on the server. Typing or manipulating another tenant ID does not grant access.

## 5. Client workspace selection
After tenant selection, Nexus lists accessible client workspaces for the selected environment.

A workspace may be unavailable when:
- workspace is suspended/archived;
- membership is disabled;
- parent tenant module entitlement is not active;
- workspace module entitlement is not active;
- no module role has been assigned.

## 6. Environment
Supported controlled contexts:
- PROD
- UAT
- TRAINING

Always verify environment before regulated work. Data and permissions may differ by environment.

## 7. Module selection
Available modules depend on tenant/workspace entitlements and assigned role.

The platform is designed for plug-and-play combinations. A client can be configured for a subset of modules; absence of an upstream UI module does not by itself mean a downstream licensed module is unavailable.

## 8. Scoped context
After module selection, Nexus creates a short-lived scoped context cookie.

This context:
- identifies selected tenant/workspace/environment/module;
- is bound to the current identity session;
- is cryptographically protected;
- does not itself contain authoritative permissions.

Server authorization is rechecked during protected requests.

## 9. Changing workspace/module
Clear or replace the scoped context, then select the new permitted workspace/module. Identity login remains active unless the session has expired/revoked.

## 10. Logout
Logout revokes the server-side identity session and clears the identity cookie. A previously issued scoped context cannot be used after the associated identity session is no longer valid.

## 11. Role behavior
Typical workspace/module roles include:
- Viewer
- Operator
- Reviewer
- QC
- Medical Reviewer
- Manager
- Admin

Actual actions also depend on tenant permissions and module-specific requirements.

## 12. Access-denied troubleshooting

### Authentication required
Identity session is absent, expired or revoked. Re-authenticate.

### No tenant available
The account has no active tenant membership. Contact the appropriate administrator.

### Workspace not listed
Check tenant selection, environment, workspace status and membership.

### Module not listed
Check parent tenant entitlement, workspace entitlement and assigned module role.

### Permission denied
The module may be visible but the requested operation is outside the assigned role/permission.

## 13. Security expectations
- Do not share session cookies/tokens.
- Do not use another person's account.
- Do not treat a URL or copied identifier as proof of access.
- Report unexpected cross-client visibility immediately.
- Use PROD only for authorized production work.

## 14. Current compatibility note
Legacy tenant-first paths remain temporarily for existing characterized module workflows. New Nexus access is identity-first. Legacy paths are retired only after each affected module passes regression/security qualification.
