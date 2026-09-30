# URS — Nexus Architecture and Security Enforcement

Document ID: URS-NEXUS-SEC-001  
Version: 1.0-draft  
Status: Sprint 3 controlled draft

## 1. Purpose
This URS defines mandatory requirements for machine-enforced architecture, secure dependency governance, authentication/authorization hardening, adversarial verification, dependency security, secret detection and release evidence for Nexus and its pharmacovigilance modules.

## 2. Scope
Sprint 3 applies to:
- shared Nexus platform code;
- authentication and authorization;
- tenant/workspace/module scoping;
- dependency boundaries;
- CI quality gates;
- dependency vulnerability controls;
- secret scanning;
- negative security verification;
- controlled migration of legacy module architecture debt.

It does not declare every legacy PV module reconciled. Module-specific architectural migration occurs in later module sprints.

## 3. Machine-enforced architecture requirements

| ID | Requirement |
|---|---|
| URS-SEC-001 | Architectural rules shall be encoded in executable tooling and shall not rely solely on written conventions. |
| URS-SEC-002 | Circular dependencies shall be prohibited in the production dependency graph. |
| URS-SEC-003 | Shared Nexus/auth/RBAC/audit/evidence/platform code shall not directly import governed vendor AI/vector/cache/event/search SDKs. |
| URS-SEC-004 | Presentation components shall not directly access database adapters. |
| URS-SEC-005 | Shared platform code shall not depend on private module-domain internals except where explicitly dispositioned as migration debt. |
| URS-SEC-006 | Legacy regulated-module direct vendor SDK usage shall be visible as architecture debt and shall be converted to blocking violations as module reconciliation completes. |
| URS-SEC-007 | Architecture rules shall execute in CI on every affected pull request. |
| URS-SEC-008 | Developer linting shall provide immediate feedback for prohibited import patterns where feasible. |
| URS-SEC-009 | Machine rules shall distinguish current blocking requirements from known transitional warnings. |
| URS-SEC-010 | A release shall not represent warning-only legacy debt as already remediated. |

## 4. Authentication/security-boundary requirements

| ID | Requirement |
|---|---|
| URS-SEC-011 | Production authorization shall not trust arbitrary tenant/user identity headers. |
| URS-SEC-012 | Demo identity fallback shall not be enabled in production. |
| URS-SEC-013 | Any trusted-header compatibility mode shall be explicitly opt-in and non-production only. |
| URS-SEC-014 | Identity session bearer values shall not be stored in plaintext server-side. |
| URS-SEC-015 | Scoped tenant/workspace/module context shall be cryptographically protected. |
| URS-SEC-016 | Scoped context shall be bound to the current identity session. |
| URS-SEC-017 | Context from one identity session shall not be reusable with another identity session. |
| URS-SEC-018 | Expired or tampered context shall fail closed. |
| URS-SEC-019 | Server authorization shall re-read mutable tenant/workspace/entitlement/role state after context selection. |
| URS-SEC-020 | Cross-tenant/cross-workspace identifier manipulation shall fail closed. |

## 5. Dependency security requirements

| ID | Requirement |
|---|---|
| URS-SEC-021 | Locked production/development dependency trees shall be scanned for known vulnerabilities. |
| URS-SEC-022 | High-severity dependency findings shall block the normal quality gate unless formally risk-accepted under controlled governance. |
| URS-SEC-023 | Dependency remediation shall prefer compatible patched versions over forced breaking changes. |
| URS-SEC-024 | Package-lock and package manifest shall remain consistent after remediation. |
| URS-SEC-025 | Dependency overrides shall be explicit, reviewable and removable when upstream dependency ranges resolve the issue. |
| URS-SEC-026 | A security audit shall not be bypassed by suppressing exit codes in the release quality gate. |

## 6. Secret scanning requirements

| ID | Requirement |
|---|---|
| URS-SEC-027 | Cleanup changes shall be scanned for committed secrets. |
| URS-SEC-028 | A secret scan that processed zero/partial intended content shall not be accepted as evidence merely because it reports no findings. |
| URS-SEC-029 | Secret-scan evidence shall record the scanned range/volume or equivalent evidence that the intended code was evaluated. |
| URS-SEC-030 | Confirmed secrets shall be removed from source, rotated where exposed and investigated before qualification. |

## 7. Adversarial verification requirements

| ID | Requirement |
|---|---|
| URS-SEC-031 | Security verification shall include valid and tampered context-token scenarios. |
| URS-SEC-032 | Security verification shall include expiry handling. |
| URS-SEC-033 | Security verification shall include cross-session replay resistance. |
| URS-SEC-034 | Security verification shall include tenant/workspace relational-integrity controls. |
| URS-SEC-035 | Security verification shall include production fail-closed behavior for demo/trusted-header paths. |
| URS-SEC-036 | Later module sprints shall expand testing to IDOR/BOLA against real module resources and workflow-state bypass attempts. |
| URS-SEC-037 | Negative tests shall be executable and retained in CI rather than remaining checklist-only. |

## 8. Audit/evidence requirements

| ID | Requirement |
|---|---|
| URS-SEC-038 | Architecture-gate results shall be retained as CI evidence. |
| URS-SEC-039 | Security-audit results shall be retained or reproducible from the locked dependency tree. |
| URS-SEC-040 | Secret-scan results shall be attributable to an exact branch/commit range. |
| URS-SEC-041 | Security-boundary tests shall be mapped to applicable URS/FRS requirements. |
| URS-SEC-042 | Material CodeRabbit findings shall be dispositioned before Sprint 3 is considered fully qualified. |
| URS-SEC-043 | Sprint 3 shall not be marked green while its normal quality CI is failing. |

## 9. Transitional architecture requirements

| ID | Requirement |
|---|---|
| URS-SEC-044 | Architecture enforcement shall be introduced without a big-bang rewrite of validated module behavior. |
| URS-SEC-045 | Boundaries proven safe at Nexus/platform level shall become blocking immediately. |
| URS-SEC-046 | Module-specific boundary debt shall remain warning-visible until the corresponding module sprint provides characterization and migration evidence. |
| URS-SEC-047 | Warning-to-blocking promotion shall be recorded as architecture evidence. |
| URS-SEC-048 | Removal of legacy auth paths shall occur only after affected modules use the new identity/workspace path and pass regression/security testing. |

## 10. Acceptance
Sprint 3 requires:
- architecture gate executes with zero blocking violations;
- security audit has no unresolved high-severity findings or a formally approved disposition;
- secret scan evaluates the intended changes and has no unresolved secret findings;
- identity/workspace and security-boundary verification pass;
- TypeScript/lint/build quality gate passes;
- documentation/traceability is current;
- CodeRabbit material findings are closed or formally dispositioned.
