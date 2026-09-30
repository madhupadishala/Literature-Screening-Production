# User Guide — Nexus Security and Architecture Administration

Document ID: UG-NEXUS-SEC-001  
Version: 1.0-draft  
Status: Sprint 3 foundation

## 1. Audience
- Platform Security Administrator
- Platform/Software Architect
- QA/Validation
- DevOps/Release Engineer
- Auditor
- Authorized developers

## 2. Purpose
This guide explains how to interpret and operate the architecture/security gates introduced in Sprint 3. It does not authorize bypassing a failing gate.

## 3. Architecture gate
The dependency-cruiser configuration classifies findings as:
- **error** — merge/release blocking;
- **warning** — visible controlled technical debt that must be resolved in the planned reconciliation sprint.

Do not downgrade an error to a warning solely to make CI pass. A rule change requires a documented architecture reason.

## 4. Blocking examples
The quality gate rejects:
- circular dependencies;
- direct Qdrant/OpenAI/Redis/Kafka/Elasticsearch/LangChain imports from Nexus/auth/RBAC/platform surfaces;
- presentation components directly importing database adapters.

## 5. Transitional warnings
Current regulated modules may still contain vendor coupling or orphan candidates. These warnings remain visible until each module is characterized and migrated.

A warning does not mean the architecture is preferred; it means remediation is intentionally sequenced.

## 6. Dependency security
Run the locked dependency audit through the project script:
`npm run security:audit`.

A high-severity finding blocks the standard quality gate.

Do not run a force-fix blindly. Review:
1. vulnerable package;
2. dependency path;
3. fixed version;
4. compatibility;
5. lockfile change;
6. PV regression/build evidence.

## 7. Secret scan
A valid secret scan must show that meaningful content was actually scanned.

Do not accept:
- revision-range failure;
- zero bytes scanned;
- partial-scan warning;
as proof that the branch is secret-free.

## 8. Trusted identity headers and demo access
Production must not rely on these compatibility mechanisms.

Non-production trusted headers require:
- NODE_ENV not production;
- `ALLOW_TRUSTED_IDENTITY_HEADERS=true`.

Demo principal requires:
- NODE_ENV not production;
- `ALLOW_DEMO_PRINCIPAL=true`.

If either appears to work in production, treat it as a security incident/defect.

## 9. Scoped-context security
The scoped context identifies the selected tenant/workspace/environment/module but is not an authorization database.

The server rechecks current memberships/entitlements/roles/permissions. Therefore, disabling access should affect the next protected request even if the browser still holds an unexpired context cookie.

## 10. Security verification
Two key verification commands are maintained:
- `npm run nexus:identity-workspace:verify`
- `npm run nexus:security-boundaries:verify`

Both must pass before the foundation is qualified.

## 11. Investigating a CI architecture failure
1. Open the architecture step.
2. Identify the rule name and source/target dependency.
3. Determine whether the dependency is a real violation or rule-definition defect.
4. Prefer moving the dependency behind the correct platform interface.
5. If the rule is wrong, change it with documented rationale and tests.
6. Re-run CI.
7. Retain the evidence in the PR.

## 12. Investigating a dependency vulnerability
1. Confirm severity and dependency path.
2. Check authoritative advisory/upstream release information.
3. Select the smallest compatible patched version.
4. update package manifest/override and lockfile;
5. run npm ci;
6. run npm audit;
7. run TypeScript/lint/build and PV regression scripts;
8. document any risk/disposition.

## 13. CodeRabbit
CodeRabbit is an independent review gate, not the primary architecture enforcement mechanism.

Material findings concerning:
- authorization;
- tenant isolation;
- architecture;
- validation;
- data integrity;
- security;
must be resolved or formally dispositioned before qualification.

## 14. Prohibited shortcuts
Do not:
- disable security audit to achieve green CI;
- add `|| true` to a release-blocking gate;
- delete code solely because Knip reports it unused;
- remove regulator/audit/evidence code without characterization;
- weaken tenant/workspace constraints for convenience;
- expose session tokens in logs;
- treat warning-only legacy debt as completed remediation.

## 15. Current limitations
Sprint 3 enforces the Nexus/platform foundation. Full module route migration and live IDOR/BOLA tests against Literature, Intake, Case Processing and Submissions occur during their module reconciliation sprints.


## 16. Detailed security-administration procedures

### 16.1 Review an architecture-gate failure

1. Open the failed CI job for the exact commit under review.
2. Identify the dependency-cruiser or ESLint rule name.
3. Determine whether the edge is:
   - a blocking platform violation;
   - a known warning-level transitional module dependency;
   - an incorrectly classified path requiring rule maintenance.
4. For a blocking violation, modify the code to use the approved platform contract or dependency direction.
5. Do not suppress the rule merely to restore green CI.
6. Re-run the quality gate and retain the new result.

### 16.2 Review a dependency vulnerability

1. Record package, affected version, severity and dependency path.
2. Determine whether the vulnerable package is direct or transitive.
3. Prefer a compatible patched version.
4. If an override is required, keep it explicit in the package manifest and lockfile.
5. Run the full locked-tree audit.
6. Run TypeScript, lint, PV verification, Nexus verification and production build.
7. Record before/after vulnerability count and any functional impact.

### 16.3 Review a secret-scan finding

1. Identify whether the finding is in governed source, Git history, dependency/generated output or a demonstrably synthetic test fixture.
2. Never copy the secret value into review comments or documentation.
3. If the finding is a real credential/token/key:
   - remove it from current source;
   - revoke/rotate the credential;
   - determine exposure scope;
   - document remediation and evidence.
4. If the finding is generated output, exclude the generated path rather than weakening the secret rule globally.
5. If the finding is a synthetic fixture, any allowlist entry must match only that exact safe fixture or narrowly controlled path.
6. Re-run both incremental and full-history/governed-working-tree scans.

### 16.4 Review an authorization-boundary failure

Capture:
- authenticated user/session;
- tenant;
- workspace;
- environment;
- module;
- requested permission;
- expected denial/allow outcome;
- observed result.

Treat an unexpected allow across tenant/workspace/module boundaries as a release-blocking security defect.

### 16.5 CodeRabbit disposition

1. Confirm that the review refers to the current code.
2. Reproduce/inspect the finding.
3. Apply the smallest correct fix when valid.
4. Run applicable tests.
5. Do not mark a finding resolved merely because a reviewer suggested a patch.
6. Request/rely on re-review of the new head.
7. Material unresolved findings block Sprint 3 qualification.

## 17. Security evidence expected for qualification

The security administrator/reviewer shall be able to identify:
- exact commit SHA;
- normal quality-gate result;
- dependency audit result;
- architecture-rule result;
- secret-scan result;
- identity/workspace verifier result;
- security-boundary verifier result;
- CodeRabbit disposition;
- known warning-level transitional debt and its target sprint.

## 18. Incident escalation conditions

Escalate immediately when any of the following is observed:
- confirmed production credential in source/history;
- successful cross-tenant or cross-workspace access;
- production trust of arbitrary identity headers/demo fallback;
- authorization granted after authoritative disablement when the next protected request should fail;
- evidence/audit tampering;
- high-severity dependency exposure with no safe mitigation and real reachable impact.
