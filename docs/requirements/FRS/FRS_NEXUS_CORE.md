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


## 13. Detailed functional requirement matrix

The following requirements are normative implementation requirements. They provide atomic FRS identifiers for traceability to the approved URS.

| FRS ID | Linked URS | Detailed functional requirement | Verification |
|---|---|---|---|
| FRS-NX-001 | URS-NX-001–004 | The identity login endpoint shall accept only string `email` and `password` values, shall normalize the email for lookup, shall not accept tenant/workspace/module as authentication authority, shall return controlled 400/401 responses, and shall use indistinguishable invalid-credential responses to prevent account enumeration. | API/static verification + negative malformed-body tests |
| FRS-NX-002 | URS-NX-004 | Failed password attempts shall be incremented atomically in PostgreSQL; the account shall enter a time-bounded lockout when the configured threshold is reached; concurrent failed requests shall not overwrite the counter with stale values. | credential-service verification / CodeRabbit disposition |
| FRS-NX-003 | URS-NX-005–009 | Successful authentication shall create a cryptographically random opaque session token; only its SHA-256 hash shall be persisted; the session shall contain issue/expiry/revocation state and the browser cookie shall be HttpOnly, SameSite=Strict and Secure in production. | identity-workspace verifier |
| FRS-NX-004 | URS-NX-007–008 | Session resolution shall fail closed when the token hash is unknown, expired, revoked, or belongs to an inactive user; a random invalid token shall not cause an unnecessary database write. | identity-session tests/static verifier |
| FRS-NX-005 | URS-NX-010 | Module authorization logic shall depend on an authenticated identity/session abstraction and shall not depend on a password-provider-specific implementation. | architecture review |
| FRS-NX-006 | URS-NX-011–015 | After authentication, tenant choices shall be generated only from active tenant memberships read from authoritative storage; client-supplied tenant identifiers shall be treated solely as selectors and revalidated server-side. | identity API / tenant-resolution negative tests |
| FRS-NX-007 | URS-NX-016–022 | Client workspaces shall be tenant-bound; workspace membership shall reference the corresponding tenant membership; lifecycle states shall support active/suspended/archived; access-history records shall retain actor, change reason, timestamps and prior/new controlled state where applicable. | migration 033 integrity verification |
| FRS-NX-008 | URS-NX-023–026 | Environment shall be a controlled enum of PROD/UAT/TRAINING. Invalid environment values shall return a controlled client error and shall never grant fallback access. | context API negative tests |
| FRS-NX-009 | URS-NX-027–036 | Tenant entitlement shall define the maximum module surface. Workspace entitlement shall be a subset. Literature, Intake, Case Processing, Submissions, Signal, Aggregate and PV Documentation shall be independently representable; lifecycle order shall not create a commercial entitlement dependency. | module registry + entitlement verification |
| FRS-NX-010 | URS-NX-035–036 | Cross-module interoperability shall use versioned contracts/APIs/events. A supported non-linear combination such as Literature + Submissions shall use a canonical validated handoff rather than direct table coupling or bypass of required regulatory validation. | architecture contract tests planned with module sprints |
| FRS-NX-011 | URS-NX-037–044 | Every protected module operation shall require active workspace membership, active tenant entitlement, active workspace entitlement, an active module role and the requested permission. Custom permissions shall be filtered to permissions valid for the selected module. | workspace-access security verifier |
| FRS-NX-012 | URS-NX-042–043 | Built-in module roles shall be represented by controlled role keys; permission evaluation shall use the controlled permission taxonomy and module-specific permission surface. | static role/permission verification |
| FRS-NX-013 | URS-NX-044,051 | Mutable membership/entitlement/role state shall be re-read from PostgreSQL on each protected request so disablement takes effect without waiting for the scoped context token to expire. | workspace guard negative tests |
| FRS-NX-014 | URS-NX-045–050 | Context selection shall occur only after authentication and shall include tenantId, workspaceId, environment and moduleKey. The signed context shall contain no authoritative permission claims. | context route/token verification |
| FRS-NX-015 | URS-NX-047–049 | Scoped context shall be HMAC-protected, bound to sessionId/userId, reject malformed or non-finite timestamps, reject materially future-issued/expired tokens, and expire no later than the associated identity session or configured context maximum. | context codec/security verifier |
| FRS-NX-016 | URS-NX-052–053 | A user with a still-valid identity session shall be able to clear/change workspace or module context without re-entering credentials; context clearing shall not revoke the identity session. | context DELETE/change-flow verification |
| FRS-NX-017 | URS-NX-054–058 | Authenticated authorization denials and context selections shall generate attributable audit/access-history records containing tenant/workspace/environment/module/action/outcome/timestamp and reason where governance requires it. | audit/access-history verification |
| FRS-NX-018 | URS-NX-059–065 | Cross-tenant/cross-workspace identifiers, forged selector values, cross-session context reuse and production demo/header identity paths shall fail closed. UUID selectors shall be validated before database queries so raw database errors are not exposed. | security-boundary negative verifier |
| FRS-NX-019 | URS-NX-061–062 | A scoped context token shall be usable only with the identity session to which it was issued; revocation/expiry of that session shall invalidate subsequent use even if the context signature itself remains cryptographically valid. | cross-session/revocation tests |
| FRS-NX-020 | URS-NX-063–064 | Production shall reject trusted identity headers and demo principals unless explicitly supported by an approved production identity mechanism; signing/session secrets shall come from protected runtime configuration and not source control. | production-principal + Gitleaks checks |
| FRS-NX-021 | URS-NX-065 | Access-control relationships shall use composite/foreign-key integrity constraints where feasible to prevent tenant/workspace cross-link creation at the database layer. | migration integrity verification |
| FRS-NX-022 | URS-NX-066–069 | Identity-first migration shall remain additive. Legacy tenant-first paths may exist only as identified compatibility paths and shall not be removed until affected modules are characterized, migrated and regression/security tested. | migration/compatibility review |
| FRS-NX-023 | URS-NX-070–074 | Automated verification shall cover tenant-free identity authentication, session hash-at-rest/revocation, cross-tenant/workspace denial, disabled authorization states, context tampering/expiry and cross-session replay. | `nexus:identity-workspace:verify` + `nexus:security-boundaries:verify` |
| FRS-NX-024 | URS-NX-075 | Qualification shall include entitlement tests for standalone modules and supported combinations; full module workflow combination tests shall be completed in the corresponding module and integration sprints. | entitlement verification + Sprint 12 integration evidence |
| FRS-NX-025 | URS-NX-001–075 | Errors shall be normalized into controlled 400/401/403/5xx responses without exposing SQL, stack, secret, membership, or authorization internals. | API negative tests / route-error review |

### 13.1 Field-level selector specification

| Field | Type | Required | Validation | Failure behavior |
|---|---|---:|---|---|
| email | string | Yes for login | trim; non-empty; application identity lookup is case-insensitive | 400 malformed; 401 invalid credentials |
| password | string | Yes for login | non-empty; passed only to password verifier | 400 malformed; 401 invalid credentials |
| tenantId | UUID string | Context GET/POST | syntactically valid UUID; active membership required | 400 invalid syntax; 403 unauthorized membership |
| workspaceId | UUID string | Context POST | syntactically valid UUID; must belong to selected tenant and active membership | 400 invalid syntax; 403 unauthorized |
| environment | enum | Context scope | PROD/UAT/TRAINING only | 400 unsupported |
| moduleKey | controlled enum | Context POST | registered Nexus module and effectively entitled | 400 invalid enum; 403 not entitled |
| reason | string | Conditional | bounded/trimmed when governance action requires reason | 400 when mandatory and absent/invalid |

### 13.2 State and failure requirements

- Session states shall distinguish active, revoked and expired conditions.
- Workspace lifecycle shall distinguish active, suspended and archived conditions.
- Entitlement shall distinguish enabled, disabled and suspended conditions plus validity windows.
- Module-role assignment shall distinguish active and disabled conditions.
- No selector, cookie, URL parameter, header or stale context token shall be sufficient to override those authoritative states.

## 14. Navigation terminology implementation standard

The application information architecture shall implement the controlled terminology defined by URS-NX-076 through URS-NX-080.

1. **Module**
   - A Module is a top-level functional domain.
   - Modules are represented in the primary module navigation.
   - A module route may expose one default Screen and additional Screens through module Sub-navigation.

2. **Screen**
   - A Screen is a distinct page/workspace supporting a defined task, workflow stage or operational responsibility.
   - Screens belonging to the same Module shall remain grouped under that Module rather than being promoted to separate primary-navigation Modules solely for convenience.

3. **Tab**
   - A Tab is a local selector between closely related views in one Screen.
   - Tabs shall preserve the parent Screen context and shall not be used to model independent workflow workspaces, separate security scopes or separate Modules.

4. **Sub-navigation**
   - Sub-navigation shall be used to move between multiple Screens within one Module.
   - Sub-navigation shall remain subordinate to the primary module navigation and shall preserve the active Module context.

### Detailed functional requirements

| FRS ID | Linked URS | Detailed functional requirement | Verification |
|---|---|---|---|
| FRS-NX-026 | URS-NX-076 | The primary module navigation shall contain only top-level Modules; child workflow pages shall not appear as peer Modules solely because they have independent routes. | UI/navigation review |
| FRS-NX-027 | URS-NX-077 | Each materially distinct functional workspace within a Module shall be represented as a Screen with a stable route or equivalent controlled navigation state. | route/UI review |
| FRS-NX-028 | URS-NX-078 | Tabs shall be limited to related views within a single Screen and shall retain the Screen's task and security context. | UI behavior review |
| FRS-NX-029 | URS-NX-079 | Modules with multiple Screens shall expose a subordinate Sub-navigation mechanism rather than placing those Screens in the primary module navigation. | navigation integration test |
| FRS-NX-030 | URS-NX-080 | Requirement documents, User Guides, traceability matrices, validation scripts/evidence and user-facing navigation nomenclature shall use the controlled terminology consistently. | documentation/traceability review |

## 15. Product Design Guardian implementation standard

| FRS ID | Linked URS | Detailed functional requirement | Verification |
|---|---|---|---|
| FRS-NX-031 | URS-NX-081–083 | Material UI work shall be reviewed against the controlled design system, with Carbon as the enterprise-density benchmark and Figma used for material design-source evidence where applicable. | Product Design Guardian review |
| FRS-NX-032 | URS-NX-084 | Shared UI primitives/tokens shall be used for recurring navigation, actions, fields, tables, status, panels and workflow states; material one-off patterns require explicit justification. | component/design review |
| FRS-NX-033 | URS-NX-085–086 | Async/workflow components shall deliberately represent applicable loading, empty, error, disabled, final/read-only and success states; controls shall map to real permission/context-aware actions. | UI state tests + browser verification |
| FRS-NX-034 | URS-NX-087 | AI-assisted content shall be visually and semantically distinguishable from human decisions and authoritative regulated source content. | UI/content review |
| FRS-NX-035 | URS-NX-088 | CI shall execute `npm run design:verify` for static design architecture and material UI qualification shall additionally retain browser/accessibility review evidence. | CI + visual evidence |
