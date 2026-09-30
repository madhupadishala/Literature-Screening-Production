# URS — Nexus Core Identity, Tenant, Workspace and Modular Access

Document ID: URS-NEXUS-CORE-001  
Version: 1.0-draft  
Status: Sprint 2 controlled draft

## 1. Purpose
Define mandatory user and compliance requirements for Nexus shared platform access and plug-and-play module entitlement.

## 2. Intended access hierarchy
`Identity -> Tenant -> Client Workspace -> Environment -> Module Entitlement -> Workspace Membership -> Module Role -> Permission -> Workflow Data -> Audit/Evidence`.

Selection of a context shall not itself grant authority.

## 3. User classes
- Platform administrator
- Security administrator
- QA/validation administrator
- Tenant/client owner or administrator
- Workspace administrator
- Module manager/operator/reviewer/QC/medical reviewer/viewer
- Auditor
- Support identity with explicitly authorized scope
- System/service identity where separately governed

## 4. Identity and authentication

| ID | Requirement |
|---|---|
| URS-NX-001 | Nexus shall authenticate a user identity before requesting tenant, client workspace or module selection. |
| URS-NX-002 | Password authentication shall not require a tenant identifier as part of identity verification. |
| URS-NX-003 | Authentication failure messages shall not disclose whether an email account exists. |
| URS-NX-004 | Repeated failed authentication attempts shall support account lockout controls. |
| URS-NX-005 | Nexus shall support durable server-side session state suitable for horizontally scaled application instances. |
| URS-NX-006 | Server-side session storage shall not store bearer session secrets in plaintext. |
| URS-NX-007 | Identity sessions shall be revocable. |
| URS-NX-008 | Expired or revoked identity sessions shall fail closed. |
| URS-NX-009 | Identity session cookies shall use secure browser-cookie controls appropriate to production. |
| URS-NX-010 | Future external identity providers shall integrate without changing module-domain authorization logic. |

## 5. Tenant selection

| ID | Requirement |
|---|---|
| URS-NX-011 | After authentication Nexus shall present only active tenants for which the identity has active membership. |
| URS-NX-012 | Selecting a tenant shall not grant access to a tenant for which active membership is absent. |
| URS-NX-013 | Tenant status changes and membership disablement shall take effect on the next protected authorization evaluation. |
| URS-NX-014 | Cross-tenant identifiers supplied through URL, body or header shall not override authoritative membership data. |
| URS-NX-015 | Platform-level roles shall remain distinct from tenant-level roles. |

## 6. Client workspace requirements

| ID | Requirement |
|---|---|
| URS-NX-016 | A client workspace shall belong to exactly one tenant. |
| URS-NX-017 | A workspace membership shall require an existing tenant membership for the same tenant/user. |
| URS-NX-018 | Workspace relations shall be tenant-bound through database constraints where feasible. |
| URS-NX-019 | Workspace lifecycle shall support active, suspended and archived states. |
| URS-NX-020 | Suspended/archived workspaces shall not provide operational module access. |
| URS-NX-021 | Workspace access history shall be retained and shall not be silently deleted with operational workspace data. |
| URS-NX-022 | Workspace access changes shall be attributable and auditable. |

## 7. Environment requirements

| ID | Requirement |
|---|---|
| URS-NX-023 | Nexus shall explicitly distinguish PROD, UAT and TRAINING environments. |
| URS-NX-024 | Entitlement and module role assignment shall be environment-scoped. |
| URS-NX-025 | Environment selection shall not be trusted without server-side validation. |
| URS-NX-026 | Production authorization shall fail closed for invalid/unsupported environment values. |

## 8. Plug-and-play module requirements

| ID | Requirement |
|---|---|
| URS-NX-027 | Tenant module entitlement shall define the maximum licensed/authorized module surface for a tenant/environment. |
| URS-NX-028 | Workspace module entitlement shall be a subset of the parent tenant entitlement surface. |
| URS-NX-029 | A module shall be independently entitleable unless a genuine regulatory/data prerequisite is explicitly defined at the domain-contract level. |
| URS-NX-030 | Commercial entitlement shall not force purchase/activation of all upstream lifecycle modules. |
| URS-NX-031 | Case Processing shall not require Intake entitlement solely because Intake is the normal upstream lifecycle module. |
| URS-NX-032 | Submissions shall be independently entitleable and shall accept validated canonical upstream contracts from supported modules/services. |
| URS-NX-033 | PV Documentation shall be independently entitleable. |
| URS-NX-034 | Nexus shall support Literature, Intake, Case Processing, Submissions, Signal, Aggregate and PV Documentation module identities. |
| URS-NX-035 | Module interoperability shall use stable versioned contracts/APIs/events rather than private table/function coupling. |
| URS-NX-036 | Supported non-linear combinations such as Literature + Submissions shall be testable without bypassing required regulatory data validation. |

## 9. Workspace module role and permission requirements

| ID | Requirement |
|---|---|
| URS-NX-037 | Operational module access shall require active workspace membership. |
| URS-NX-038 | Operational module access shall require active parent tenant entitlement. |
| URS-NX-039 | Operational module access shall require active workspace module entitlement. |
| URS-NX-040 | Operational module access shall require an active module role or explicitly governed equivalent. |
| URS-NX-041 | Required tenant permission and workspace module permission shall both be evaluated where the policy requires layered authority. |
| URS-NX-042 | Module roles shall support viewer/operator/reviewer/QC/medical-reviewer/manager/admin classes where applicable. |
| URS-NX-043 | Custom permissions shall be validated against the controlled permission taxonomy. |
| URS-NX-044 | Disabled roles/memberships/entitlements shall take effect without waiting for a client token to expire. |

## 10. Context requirements

| ID | Requirement |
|---|---|
| URS-NX-045 | Nexus shall allow context selection only after identity authentication. |
| URS-NX-046 | Selected context shall include tenant, workspace, environment and module. |
| URS-NX-047 | Context shall be cryptographically protected against client alteration. |
| URS-NX-048 | Context shall be bound to the authenticated identity session. |
| URS-NX-049 | Context expiration shall be shorter than or equal to the identity session lifetime. |
| URS-NX-050 | A valid context token shall not contain authoritative permissions. |
| URS-NX-051 | Every protected operation shall re-read mutable authorization state from authoritative server-side data. |
| URS-NX-052 | Changing client/workspace/module shall not require identity re-authentication while the identity session remains valid. |
| URS-NX-053 | Clearing context shall not necessarily log out the authenticated identity. |

## 11. Audit and evidence requirements

| ID | Requirement |
|---|---|
| URS-NX-054 | Authorization denials shall be auditable with actor, scope, action/outcome and timestamp where an authenticated actor exists. |
| URS-NX-055 | Audit records shall support tenant, workspace, environment and module scope. |
| URS-NX-056 | Context selection shall be recorded in controlled access history. |
| URS-NX-057 | Audit/history retention shall not depend on mutable browser state. |
| URS-NX-058 | Access-control changes shall require a reason where defined by governance policy. |

## 12. Security requirements

| ID | Requirement |
|---|---|
| URS-NX-059 | Cross-tenant and cross-workspace IDOR/BOLA attempts shall fail closed. |
| URS-NX-060 | A user shall not gain access by manipulating tenant/workspace/module identifiers. |
| URS-NX-061 | A context token from one identity session shall not be usable with another identity session. |
| URS-NX-062 | Revocation of an identity session shall invalidate subsequent protected use of its scoped context. |
| URS-NX-063 | Demo/header fallback identity paths shall not be accepted as production authority. |
| URS-NX-064 | Secrets used for signing/session security shall not be stored in source control. |
| URS-NX-065 | Access-control database relationships shall use least-privilege and integrity constraints. |

## 13. Compatibility and migration

| ID | Requirement |
|---|---|
| URS-NX-066 | Migration to identity-first access shall be additive until affected PV modules are reconciled and regression-tested. |
| URS-NX-067 | Existing validated PV workflow behavior shall not be silently changed by the access-foundation migration. |
| URS-NX-068 | Legacy tenant-first authentication may temporarily remain only as an explicitly identified compatibility path. |
| URS-NX-069 | Retirement of legacy auth/context paths shall require module regression and security evidence. |

## 14. Validation requirements

| ID | Requirement |
|---|---|
| URS-NX-070 | Verification shall cover identity-first authentication without tenant input. |
| URS-NX-071 | Verification shall cover session hash-at-rest design and revocation. |
| URS-NX-072 | Verification shall cover cross-tenant and cross-workspace negative cases. |
| URS-NX-073 | Verification shall cover disabled tenant/workspace/module/membership/role states. |
| URS-NX-074 | Verification shall cover context tampering, expiry and cross-session replay. |
| URS-NX-075 | Verification shall cover standalone and supported module-combination entitlement. |

## 15. Navigation terminology and information architecture requirements

The following terminology is normative across Nexus user-interface requirements, functional specifications, user guides, validation evidence and implementation naming.

| Term | Controlled definition |
|---|---|
| Module | A top-level functional domain represented in the primary module navigation, for example Literature Screening, Intake, Case Processing or Submissions. |
| Screen | A distinct functional page or workspace within a module that supports a defined user task or workflow state. |
| Tab | A local view selector within the same screen. A tab shall not be used to represent an independent module or a materially distinct workflow workspace. |
| Sub-navigation | The navigation mechanism used to move between multiple screens belonging to the same module. |

| ID | Requirement |
|---|---|
| URS-NX-076 | Nexus shall use the term **Module** only for top-level functional domains represented in the primary module navigation. |
| URS-NX-077 | Nexus shall use the term **Screen** for a distinct functional page or workspace within a module. |
| URS-NX-078 | Nexus shall use the term **Tab** only for switching between related views within the same screen and shall not use tabs as substitutes for independent modules or materially distinct workflow screens. |
| URS-NX-079 | Nexus shall use **Sub-navigation** to navigate between multiple screens within the same module. |
| URS-NX-080 | URS, FRS, User Guides, traceability records, UI labels and validation evidence shall use Module, Screen, Tab and Sub-navigation consistently with these controlled definitions. |

