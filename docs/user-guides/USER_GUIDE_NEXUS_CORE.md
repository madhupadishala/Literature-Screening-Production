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


## 15. Detailed operating procedures

### 15.1 Sign in and establish identity

**Prerequisite:** the user account is active and the user possesses valid credentials.

1. Open the Nexus sign-in surface.
2. Enter the registered email address.
3. Enter the password.
4. Submit the login request.
5. Confirm that the application establishes an identity session before displaying tenant choices.
6. Confirm that the returned tenant list contains only tenants for which the identity has active membership.

**Expected result:** the user is authenticated as an identity and is prompted to select tenant context. No client workspace or module access is granted solely by successful login.

**Failure behavior:** malformed credentials input is rejected as a client error; invalid credentials do not reveal whether the email exists; a locked account remains unavailable until the lockout control permits another attempt.

### 15.2 Select tenant

1. Choose one tenant from the active tenant memberships shown after login.
2. Do not manually alter tenant identifiers in the URL/request.
3. Continue to workspace selection.

**Expected result:** Nexus revalidates the selected tenant against the authenticated identity and returns only permitted workspaces.

### 15.3 Select client workspace

1. Review the active client workspaces available for the selected tenant.
2. Select the intended client workspace.
3. Verify the workspace display name before continuing.

**Expected result:** suspended, archived, cross-tenant or non-member workspaces are not usable.

### 15.4 Select environment

1. Select PROD, UAT or TRAINING according to the intended work.
2. Confirm the selected environment before opening a module.

**Warning:** data and entitlements are environment-scoped. Users shall not assume that access in UAT or TRAINING grants production access.

### 15.5 Select module

1. Review modules effectively entitled for the tenant/workspace/environment.
2. Select the required module.
3. Nexus evaluates tenant entitlement, workspace entitlement and active module-role assignment.
4. If authorized, the module context is issued.

**Expected result:** only entitled modules with an active role are selectable for operational use.

### 15.6 Change client or module without logging in again

1. Leave the current module context using the platform context-change function.
2. Select another permitted workspace or module.
3. Nexus creates a new scoped context after server-side revalidation.

**Expected result:** the identity session remains active unless it has expired/revoked or the user explicitly logs out.

### 15.7 Logout

1. Select logout.
2. Nexus revokes the server-side identity session.
3. The browser identity and scoped-context cookies are cleared.

**Expected result:** previously issued scoped context can no longer authorize protected requests because the bound identity session is no longer active.

## 16. Role and permission operating notes

- A workspace role and module role serve different scopes.
- A module role does not override tenant/module entitlement.
- Custom permissions remain constrained to the selected module's controlled permission taxonomy.
- A user whose role/membership/entitlement is disabled may lose access on the next protected request even if the screen remains open.
- Access-denied responses shall be treated as authoritative; refreshing or manipulating identifiers is not a valid recovery method.

## 17. Security and audit cautions

- Do not share identity-session cookies, scoped-context cookies or screenshots containing sensitive identifiers.
- Do not use production demo/header compatibility mechanisms; they are intentionally unavailable as production authority.
- Context selection and authorization denials may be recorded in audit/access history.
- If a user unexpectedly retains access after an administrator disables a membership/role/entitlement, record the exact time, user, tenant, workspace, environment, module and request, and escalate as a security incident.

## 18. Current release limitations

This guide describes the Sprint 2 foundation behavior. Existing legacy PV routes are not automatically considered migrated to the new workspace guard. Each module's own User Guide will be updated when that module is reconciled to the Nexus access foundation.
