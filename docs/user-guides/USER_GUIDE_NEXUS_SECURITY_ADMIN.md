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
