# FRS — Nexus Core Identity, Tenant, Workspace and Modular Access

Document ID: FRS-NEXUS-CORE-001  
Version: 1.0-draft  
Status: Sprint 2 controlled draft  
Linked URS: URS-NEXUS-CORE-001

## 1. Architecture
New Nexus access uses:
`Identity Session -> Tenant Membership -> Client Workspace -> Environment -> Tenant Module Entitlement -> Workspace Module Entitlement -> Workspace Module Role -> Permission`.

Existing PV routes remain on their characterized compatibility path until their module sprint migrates them.

## 2. Database model

### 2.1 Identity sessions
Table: `nexus_identity_sessions`

Required fields:
- UUID session ID;
- application user ID;
- SHA-256 token hash (64 lowercase hex);
- provider;
- status;
- issued/expiry/last-seen timestamps;
- revoked timestamp;
- JSON metadata.

The database shall never store the opaque cookie token itself.

### 2.2 Client workspaces
Table: `nexus_client_workspaces`
- tenant-bound unique workspace key;
- display name;
- active/suspended/archived;
- version;
- controlled configuration.

### 2.3 Workspace membership
Table: `nexus_workspace_memberships`
- composite tenant/workspace/user integrity;
- parent tenant membership FK;
- workspace role;
- active/disabled;
- version/update attribution.

### 2.4 Workspace module entitlement
Table: `nexus_workspace_module_entitlements`
- tenant/workspace/environment/module;
- parent tenant entitlement FK;
- enabled/disabled/suspended;
- capability/limit objects;
- validity window;
- version.

### 2.5 Workspace module roles
Table: `nexus_workspace_module_roles`
- tenant/workspace/user/environment/module;
- controlled role key;
- custom permission array;
- active/disabled;
- version.

### 2.6 Audit/history
`audit_events` gains workspace/environment/module scope.  
`nexus_workspace_access_history` retains access/control history with change reason and attribution.

## 3. Identity authentication API
Endpoint: `/api/auth/identity`

### POST
Input:
- `email`: required string
- `password`: required secret string

Tenant/workspace/module input is not accepted as authentication authority.

Success:
- creates opaque random 256-bit session token;
- stores SHA-256 token hash only;
- sets HttpOnly, SameSite=Strict cookie; Secure in production;
- returns identity and active tenant memberships;
- returns next state `SELECT_TENANT`.

Failure:
- malformed body → 400;
- invalid credentials → 401 without account enumeration;
- locked account → 401.

### GET
- resolves cookie hash against active non-expired DB session;
- rechecks user active status;
- returns current identity and active tenant memberships.

### DELETE
- revokes server-side session;
- clears identity cookie.

## 4. Credential service
`verifyIdentityCredentials(email,password)` performs:
1. case-insensitive account lookup;
2. active account check;
3. lockout check;
4. bcrypt password verification;
5. failed-attempt increment/lockout on failure;
6. reset attempts/lockout and update last login on success.

Legacy `verifyCredentials(email,password,tenantKey)` delegates identity verification then performs tenant membership lookup, and is marked compatibility-only.

## 5. Context API
Endpoint: `/api/nexus/context`

### GET
Requires valid identity session.  
Input query:
- `tenantId`: required selected tenant;
- `environment`: optional, defaults PROD, must be PROD/UAT/TRAINING.

Server:
- revalidates active tenant membership;
- lists only active workspaces and effectively entitled modules/roles.

### POST
Input:
- tenantId
- workspaceId
- environment
- moduleKey
- optional reason

Server sequence:
1. resolve identity session;
2. revalidate selected tenant membership;
3. evaluate tenant entitlement;
4. evaluate workspace membership;
5. evaluate workspace entitlement;
6. require assigned module role;
7. create signed short-lived context selector;
8. bind selector to identity session ID;
9. record access-history event;
10. set HttpOnly/SameSite=Strict/Secure-in-production context cookie.

### DELETE
Clears context cookie without revoking identity session.

## 6. Context token
Payload:
- identity session ID;
- user ID;
- tenant ID;
- workspace ID;
- environment;
- module key;
- issued/expiry.

It shall contain no authoritative permissions.

Signature:
- HMAC-SHA256;
- derived from SESSION_SECRET using a context-specific derivation label;
- constant-time signature comparison.

## 7. Protected authorization guard
`requireWorkspaceModulePermission(request,module,permission)` shall:
1. resolve durable identity session;
2. validate context signature and expiry;
3. require session ID and user ID match;
4. resolve tenant membership from DB;
5. check tenant permission;
6. evaluate current workspace/module entitlement/role from DB;
7. audit denial;
8. return scoped principal only after all checks pass.

## 8. Module registry
Registry shall explicitly contain:
- LITERATURE
- INTAKE
- CASE_PROCESSING
- MEDICAL_REVIEW
- SUBMISSIONS
- SIGNAL_MANAGEMENT
- AGGREGATE_REPORTING
- PV_DOCUMENTATION
- GOVERNANCE

Normal lifecycle order does not imply entitlement dependency.  
`CASE_PROCESSING.dependencies` is empty; canonical input validation belongs to workflow/contracts.

## 9. Migration strategy
Migration 033 is additive. No prior migration 001–032 is rewritten.  
No existing PV table content is automatically re-parented into workspaces in Sprint 2. Module data migration occurs only with module-specific characterization and validation.

## 10. Error behavior
- authentication absent → 401;
- active identity but unauthorized tenant/workspace/module → 403;
- malformed/unsupported selector → 400;
- no exception path may convert a 401/403 into a 500 solely due to error-class differences.

## 11. Security negative tests
The validation suite shall include:
- forged context signature;
- expired context;
- context from another session;
- tenant membership disabled after context issued;
- workspace membership disabled after context issued;
- tenant module disabled;
- workspace module disabled;
- module role disabled/absent;
- permission denied;
- cross-tenant workspace ID;
- cross-workspace resource identifier;
- identity session revoked;
- identity session expired.

## 12. Compatibility
No existing PV route is assumed converted merely because the new guard exists. Each module sprint must explicitly migrate protected routes and demonstrate no behavior regression.
