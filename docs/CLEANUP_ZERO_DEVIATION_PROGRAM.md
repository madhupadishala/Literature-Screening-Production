# Zero-Deviation Cleanup Program

## Purpose

Create a clean, production-grade codebase from the current implementation without changing validated business behavior, regulated workflow intent, or approved data semantics.

The current `main` branch is the preserved baseline. Cleanup work is performed only on:

`cleanup/zero-deviation-baseline-20260930`

## Nine mandatory gates

Every sprint, pull request, release candidate and cleanup change must pass all nine gates.

1. **Karpathy Gate**
   - Understand before editing.
   - Prefer the smallest correct change.
   - No speculative redesign.
   - Verify behavior after every material change.

2. **Ponytail Gate**
   - Remove unnecessary complexity.
   - Avoid abstraction without demonstrated need.
   - Prefer clear, local, maintainable code.

3. **Architecture Guardian Gate**
   - Preserve the canonical platform boundary:
     - Identity
     - Tenant
     - Client Workspace
     - Environment
     - Module Entitlement
     - Workspace Membership
     - Module Role
     - Permission
     - Workflow Data
     - Immutable Audit/Evidence
   - Modules may not invent their own authentication, authorization, tenancy, audit, storage or context architecture.
   - Cross-module dependencies must be explicit and controlled.

4. **Warpath Gate**
   - Follow complete real workflows.
   - Cover unhappy paths, invalid states, edge conditions, failure recovery and operational behavior.
   - No partial-path implementation may be called complete.

5. **CodeRabbit Gate**
   - Independent code review required for cleanup PRs.
   - Unresolved high-confidence findings block promotion.

6. **Hacker Gate**
   - Adversarial security verification against authorization, tenant isolation, IDOR/BOLA, injection, session/context abuse, privilege escalation, replay, malicious uploads, audit manipulation and data leakage.
   - Remediation must be retested.

7. **Evidence Gate**
   - Every promoted change must produce traceable evidence:
     requirement -> architecture -> code -> test -> security -> evidence -> UAT/validation -> release.

8. **Regulatory Knowledge Gate**
   - Regulated PV requirements must trace to authoritative regulator/harmonised sources where available.
   - Source authority, jurisdiction, version/revision, effective date and lifecycle status must be controlled.
   - Model memory is not an authoritative regulatory source.
   - Jurisdictional differences and regulator updates require explicit impact assessment.

9. **Modular & Benchmark Completeness Gate**
   - Nexus and PV modules must preserve the plug-and-play architecture.
   - URS/FRS must be benchmarked against mature market tools and authoritative regulatory requirements.
   - Material fields, workflow states, validations, exceptions, audit/evidence, integrations and controls must not be omitted merely because the current implementation lacks them.

## Baseline benchmark stack

### Code and dependency quality
- TypeScript strict compilation
- ESLint / Next.js Core Web Vitals
- npm audit
- Knip for unused files, dependencies and exports
- jscpd for duplication
- dependency-cruiser for architecture and dependency-boundary enforcement
- Madge as a secondary circular-dependency visualization/check

### Security
- Gitleaks for committed and working-tree secrets
- npm audit for dependency vulnerabilities
- static security rules/scanning
- OWASP-aligned authenticated application security testing
- tenant/client/module authorization negative tests

### Application and release quality
- existing PV verification scripts
- existing Nexus verification scripts
- production Next.js build
- database migration integrity checks
- immutable audit/evidence checks
- positive and negative RBAC scenarios
- golden-path and failure-path E2E tests

## Baseline report

Before modifying application code, capture:

- total source files
- total lines of application code
- dependency count
- unused dependency count
- unused export/file count
- duplication percentage
- circular dependency count
- architecture-rule violations
- TypeScript errors
- ESLint errors/warnings
- test pass/fail counts
- dependency vulnerability counts by severity
- detected secrets
- tenant/workspace/module authorization failures
- production build status
- migration integrity status
- audit/evidence integrity status

This creates the immutable "BEFORE" benchmark.

## Cleanup sequence

### Phase 0 - Freeze
- Preserve current main.
- No feature work on cleanup branch.
- Record main commit SHA.
- Record current production schema/migration head.
- Record current known functional behavior.

### Phase 1 - Observe
Run all benchmark tools without changing code.

Deliverable:
`docs/cleanup/BASELINE_REPORT.md`

### Phase 2 - Architecture map
Create the actual current dependency and domain map and compare it with the canonical architecture.

Deliverables:
- `docs/architecture/CANONICAL_ARCHITECTURE.md`
- `docs/architecture/CURRENT_VS_TARGET.md`
- dependency graph artifact

### Phase 3 - Remove contamination
Only after baseline:
- dead code
- unused exports
- unused dependencies
- duplicated helpers
- abandoned experimental code
- generated/temp files
- obsolete migration/test artifacts that are proven unnecessary

No workflow behavior changes.

### Phase 4 - Boundary remediation
Correct architecture violations with the smallest possible changes.

Priority:
1. authentication/session
2. tenant isolation
3. client workspace isolation
4. module entitlement
5. module RBAC
6. audit/evidence
7. cross-module contracts

### Phase 5 - Security hardening
Run static + adversarial security gates and remediate findings.

### Phase 6 - Full regression
Literature -> Intake/Triage -> L2A/Case Processing -> Submissions/shared platform.

No module passes because another module passed.

### Phase 7 - Clean export candidate
Freeze a release-candidate commit only when every mandatory applicable gate is green. A failed mandatory gate shall not be waived by disposition. Disposition is limited to documented non-applicability or an approved external dependency/exception that does not bypass a mandatory control.

## Clean export strategy

Do **not** simply fork the existing repository or copy the full Git history into the new clean repository.

The old repository remains the provenance/history repository.

The new repository is created from a verified source snapshot of one exact cleanup release-candidate commit.

### Export contents

Include only:
- application source
- approved migrations
- required scripts
- tests
- CI/CD definitions
- architecture documents
- validation/verification scripts
- dependency manifests and lockfiles
- environment variable templates with no secrets
- required operational documentation

Exclude:
- `.git`
- old branch history
- build artifacts
- `.next`
- `node_modules`
- temporary exports
- local environment files
- real credentials/secrets
- obsolete experiments
- duplicate documentation
- unapproved test data containing sensitive data

### Provenance file

The new repository must contain `PROVENANCE.md` recording:
- source repository
- source cleanup branch
- exact source commit SHA
- export date
- migration head
- benchmark report reference
- nine-gate result
- release approver
- SHA-256 of the exported source archive

### First commit policy

The new repository's first commit represents:
"Verified clean baseline imported from controlled cleanup program."

This gives a clean Git history while preserving full historical traceability in the original repository through `PROVENANCE.md`.

## Non-negotiable zero-deviation rule

Cleanup may improve code structure, security, architecture, readability and maintainability.

Cleanup may NOT silently change:
- regulated workflow decisions
- safety data meaning
- tenant/client ownership
- audit history semantics
- evidence semantics
- validation-critical calculations
- role authority
- approved business behavior

Any intended behavior change must leave the cleanup stream and enter a separately approved feature/change-control stream.
