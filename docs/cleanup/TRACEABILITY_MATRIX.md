# Cleanup Traceability Matrix

This document links requirements, architecture, implementation, tests and release evidence.

| Req | FRS | Area | Verification ID(s) | Planned evidence | Status |
|---|---|---|---|---|---|
| URS-001..012 | FRS-001..019 | Identity/Tenant/Workspace/RBAC | VER-NEXUS-IDENTITY-WORKSPACE; VER-NEXUS-SEC-BOUNDARY | architecture tests + authorization negative tests | in progress |
| URS-020..030 | FRS-020..047; FRS-170..175 | Shared capabilities | VER-ARCH-DEPCRUISE; VER-ARCH-ESLINT | adapter/interface tests + dependency-cruiser rules | in progress |
| URS-040..049 | FRS-050..069 | AI/Retrieval | VER-AI-RETRIEVAL-AUTH; VER-AI-PROVENANCE | retrieval auth tests + provenance/eval evidence | planned |
| URS-060..065 | FRS-070..079 | Literature | VER-LIT-REGRESSION | existing literature verification + regression | planned |
| URS-070..075 | FRS-080..089 | Intake | VER-INTAKE-REGRESSION | existing intake/Nexus verification + regression | planned |
| URS-080..085 | FRS-090..099 | L2A | VER-L2A-STATE-RBAC-EVIDENCE | state/RBAC/evidence regression | planned |
| URS-090..095 | FRS-100..119 | Submissions | VER-SUBMISSION-WORKFLOW; VER-SUBMISSION-IDEMPOTENCY | submission workflow/idempotency evidence | planned |
| URS-100..104 | FRS-140..144 | Audit/Evidence | VER-AUDIT-ATTRIBUTION; VER-EVIDENCE-INTEGRITY | immutability + attribution verification | planned |
| URS-110..117 | FRS-160; FRS-170..175 | Security | VER-SECRET-INCR; VER-SECRET-FULL; VER-NPM-AUDIT; VER-NEXUS-SEC-BOUNDARY | Gitleaks + dependency audit + adversarial tests | in progress |
| URS-120..126 | FRS-150..157 | Code quality | VER-CQ-TS; VER-CQ-ESLINT; VER-CQ-BUILD; VER-CQ-NPM-AUDIT; VER-CQ-KNIP; VER-CQ-JSCPD; VER-CQ-MADGE; VER-CQ-DEPCRUISE | tsc/eslint/build/npm-audit/Knip/jscpd/Madge/dependency-cruiser | planned |
| URS-130..134 | FRS-150..160 | Benchmark | VER-BASELINE-BEFORE; VER-BASELINE-AFTER | BEFORE/AFTER report | in progress |
| URS-140..145 | FRS-180..184 | Clean export | VER-EXPORT-PROVENANCE; VER-EXPORT-HASH; VER-EXPORT-CI | provenance + archive hash + clean-repo CI | planned |

## Change record format

Every cleanup PR/change shall record:
- requirement(s)
- baseline finding
- architecture impact
- code change
- tests executed
- security evidence
- CodeRabbit disposition
- residual risk
- before/after benchmark impact


## Verification identifier definitions

- **VER-CQ-TS** — TypeScript strict check.
- **VER-CQ-ESLINT** — repository ESLint/Next lint.
- **VER-CQ-BUILD** — production Next.js build.
- **VER-CQ-NPM-AUDIT** — dependency vulnerability audit.
- **VER-CQ-KNIP** — unused file/export/dependency analysis.
- **VER-CQ-JSCPD** — duplication analysis.
- **VER-CQ-MADGE** — circular dependency analysis.
- **VER-CQ-DEPCRUISE** — architecture/dependency analysis.
- **VER-SECRET-INCR** — incremental PR Gitleaks scan.
- **VER-SECRET-FULL** — full-history + working-tree Gitleaks baseline.
- **VER-NEXUS-IDENTITY-WORKSPACE** — identity-first/workspace architecture verification.
- **VER-NEXUS-SEC-BOUNDARY** — scoped-context and security boundary negative verification.
- **VER-ARCH-DEPCRUISE** — dependency-cruiser architecture-boundary verification.
- **VER-ARCH-ESLINT** — ESLint restricted-import and architecture rule verification.
- **VER-PVK-FOUNDATION** — controlled regulatory knowledge catalog, metadata, ingestion and retrieval-foundation verification.
- **VER-AI-RETRIEVAL-AUTH** — authorization-scoped retrieval negative/positive verification.
- **VER-AI-PROVENANCE** — AI/model/retrieval provenance evidence verification.
- **VER-LIT-REGRESSION** — Literature Screening regulated workflow regression verification.
- **VER-INTAKE-REGRESSION** — Intake & Triage regulated workflow regression verification.
- **VER-L2A-STATE-RBAC-EVIDENCE** — L2A state-transition, authorization and evidence verification.
- **VER-SUBMISSION-WORKFLOW** — submission preparation/transmission/acknowledgement workflow verification.
- **VER-SUBMISSION-IDEMPOTENCY** — retry/replay/idempotency verification.
- **VER-AUDIT-ATTRIBUTION** — actor/scope/action/outcome audit attribution verification.
- **VER-EVIDENCE-INTEGRITY** — evidence immutability/tamper-detection/reproducibility verification.
- **VER-NPM-AUDIT** — dependency vulnerability audit used as a security gate alias.
- **VER-BASELINE-BEFORE** — immutable BEFORE benchmark evidence.
- **VER-BASELINE-AFTER** — AFTER benchmark and comparison evidence.
- **VER-EXPORT-PROVENANCE** — clean export provenance record verification.
- **VER-EXPORT-HASH** — exported source archive SHA-256 verification.
- **VER-EXPORT-CI** — clean repository CI qualification.

A verification identifier is marked complete only when its objective evidence exists for the qualified commit; listing an identifier does not itself prove execution.


## Sprint 0–3 detailed traceability

| URS range | FRS range | Scope | Verification | Current qualification state |
|---|---|---|---|---|
| URS-PVK-001–074 | FRS-PVK-001–023 | Controlled regulatory knowledge source lifecycle, acquisition, provenance, chunking, embedding, retrieval, review and update impact | VER-PVK-FOUNDATION; source-catalog validation; ingestion/retrieval tests | foundation implemented; full corpus acquisition/production approval intentionally not yet claimed |
| URS-NX-001–004 | FRS-NX-001–002 | Identity-first credential validation and lockout | VER-NEXUS-IDENTITY-WORKSPACE; CodeRabbit security review | implemented / verified by current CI |
| URS-NX-005–010 | FRS-NX-003–005 | Durable identity session and provider-independent identity | VER-NEXUS-IDENTITY-WORKSPACE | implemented / verified |
| URS-NX-011–026 | FRS-NX-006–008 | Tenant/workspace/environment hierarchy | VER-NEXUS-IDENTITY-WORKSPACE; VER-NEXUS-SEC-BOUNDARY | implemented / verified |
| URS-NX-027–036 | FRS-NX-009–010 | Plug-and-play entitlements and canonical module contracts | module registry verification; future module contract tests | Nexus foundation implemented; module contract qualification continues in module sprints |
| URS-NX-037–044 | FRS-NX-011–013 | Workspace/module role and permission enforcement | VER-NEXUS-SEC-BOUNDARY | implemented / verified |
| URS-NX-045–053 | FRS-NX-014–016 | Scoped context creation, binding, expiry and context switching | VER-NEXUS-SEC-BOUNDARY | implemented / verified |
| URS-NX-054–058 | FRS-NX-017 | Access/audit attribution | migration/static verification; module evidence expansion later | implemented foundation / partial live-workflow coverage |
| URS-NX-059–065 | FRS-NX-018–021 | IDOR boundary foundation, production principal hardening, secrets and relational integrity | VER-NEXUS-SEC-BOUNDARY; VER-SECRET-INCR; VER-SECRET-FULL | code implemented; secret baseline must be green on current head |
| URS-NX-066–075 | FRS-NX-022–025 | additive migration, compatibility, regression and entitlement qualification | VER-NEXUS-IDENTITY-WORKSPACE; existing PV regression | implemented / transitional module migration explicit |
| URS-SEC-001–010 | FRS-SEC-001–005 | machine-enforced architecture | VER-ARCH-DEPCRUISE; VER-ARCH-ESLINT; VER-CQ-MADGE | blocking platform rules implemented; module debt warning-visible |
| URS-SEC-011–020 | FRS-SEC-006–009 | production authorization/context security | VER-NEXUS-SEC-BOUNDARY | implemented / verified |
| URS-SEC-021–026 | FRS-SEC-010 | dependency vulnerability gate | VER-NPM-AUDIT | current locked tree reports 0 vulnerabilities |
| URS-SEC-027–030 | FRS-SEC-011–012 | secret scanning | VER-SECRET-INCR; VER-SECRET-FULL | current rerun required after Gitleaks policy correction |
| URS-SEC-031–037 | FRS-SEC-013–014 | executable negative security verification | VER-NEXUS-SEC-BOUNDARY | foundation verified; real module-resource Hacker Gate continues in module sprints |
| URS-SEC-038–048 | FRS-SEC-015–020 | evidence, CodeRabbit, incremental enforcement and legacy retirement | CI artifacts + PR #80 review | qualification pending final CodeRabbit/current-head evidence |

### Sprint 0–3 documentation rule

The following controlled documents are required and versioned in Git:
- detailed URS;
- detailed FRS with atomic identifiers and linked URS;
- task-oriented User Guide describing actual implemented behavior;
- regulatory/source register where domain knowledge is involved;
- objective verification evidence attributable to the exact commit.

A sprint is not green when its code passes but its URS/FRS/User Guide or traceability is incomplete.
