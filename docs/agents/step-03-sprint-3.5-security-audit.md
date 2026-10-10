# Sprint 3.5 — Literature identity, tenant/client isolation, and audit hardening

**Status: STARTED — first-pass source audit, no security qualification claim.**

## Scope / traceability
URS-LIT-001–006, 017, 022–026, 063, 090–093 and URS-LIT-103; FRS-LIT-001–003, 007–008, 015 and 019. Preserve existing Hits → Screening → MR → Intake flow.

## Reviewed source baseline

| Control | Exact source | Observed implementation | Disposition |
|---|---|---|---|
| Authentication and context | `frontend/lib/rbac/workspace-guard.ts` | Requires identity session, a signed/validated context tied to user/session, server-side tenant permission and workspace/module role evaluation | PRESENT_CODE; negative tests required |
| Client workspace/environment scope | `frontend/lib/safety/common/safety-workspace-scope.ts` | Requires server-authorized principal workspace; scope queries bind tenant, workspace, environment and resource ID | PRESENT_CODE; negative tests required |
| MR privilege | `frontend/app/api/literature/review/medical/route.ts` | Guards POST with `NEXUS_MODULES.LITERATURE` and `PERMISSIONS.MEDICAL_REVIEW` | PRESENT_CODE |
| Intake generation privilege | `frontend/app/api/literature/intake-input/route.ts` | Guards POST with `INTAKE_INPUT_GENERATE` | PRESENT_CODE |
| Authorization denials | `frontend/lib/rbac/workspace-guard.ts` | Attempts `WORKSPACE_AUTHORIZATION_DENIED` audit with actor, scope, request ID, method, path, reason; query errors intentionally do not override denial | PRESENT_CODE; audit persistence under DB outage not guaranteed |

## Verification plan / closure requirements

1. Enumerate current Literature API routes and map scoped module permissions, including read/history and download.
2. Test missing authentication, absent/tampered/expired or mismatched context, disabled workspace/module membership, privilege escalation and cross-tenant/workspace requests; verify 401/403.
3. Verify service-level filtering for history, review, article/OCR, translation and Intake exports, including tenant/workspace/environment and persistence boundaries.
4. Verify audit event content for authorized review/handoff and denied requests, ensuring it does not disclose protected payload or tokens.
5. Correct only demonstrated defects, run current frontend security and Literature verification plus targeted negative checks, record exact CI SHAs.
6. Close only with passing evidence. Pending shared specialist AI models are not a Sprint 3.5 engineering blocker.

**No source behavior is changed in this baseline commit. No API attack simulation or production test has been run.**

## Sequential engineering execution evidence

**1. Endpoint permissions.** The existing `frontend/scripts/verify-cleanup-sprint4-literature.ts` inventories **24** Literature/workflow route handlers and checks for `requireWorkspaceModulePermission` and explicit `NEXUS_MODULES.LITERATURE`, rejecting legacy guard usage. Inspected concrete permissions: Search execute/history `SEARCH_EXECUTE`/`SEARCH_HISTORY_VIEW`; Hits read `SEARCH_HISTORY_VIEW`; Medical Review `MEDICAL_REVIEW`; export generate/download `INTAKE_INPUT_GENERATE`/`INTAKE_INPUT_DOWNLOAD`; translation `REVIEW_VIEW`/`REVIEW_EDIT`; document processing `SEARCH_HISTORY_VIEW`/`EVIDENCE_CREATE`. Other enumerated handlers pass the generic authorization-gate source contract; individual per-method roles were not independently runtime-executed.

**2. Unauthorized cross-scope tests.** Existing `verify-nexus-security-boundaries.ts` tests signed context decoding and modified-tenant tampering; Literature source contract covers per-handler guard adoption. No real HTTP 401/403 against a deployed tenant and no database-backed multi-user negative run was performed. Therefore dynamic access testing is **PENDING** rather than PASS.

**3. Database/historical isolation.** **Confirmed defect:** `listReviewWorklist` in `review-workflow-service.ts` filtered review rows by tenant but not selected client workspace/environment. `getWorkspaceForUpdate` in `review-mutation-service.ts` similarly used only workspace-row ID plus tenant without a package workspace/environment predicate. These allowed a user authorized for one client workspace in a tenant to target another client's Review data if IDs were known. **Fixed** by binding package.workspace_id and package.environment to server-authorized principal scope: commits `744484c7`, `c1627e5c`. Details now derive from the scoped worklist, and mutations share the fixed locking helper. Regression source assertions committed at `2074fc3b`. Separate in-memory transient histories use tenant-level filtering; workspace-level separation there remains a follow-up investigation and is not represented as resolved.

**4. Audit/privacy.** `workspace-guard.ts` checks identity context, module and effective roles; on denied decisions it attempts `WORKSPACE_AUTHORIZATION_DENIED` audit with actor ID, scope, request ID, method/path and rejection reason. Denial audit errors are caught to avoid altering authorization behavior. This means deny behavior is fail-closed but audit recording is best-effort, and untrusted forwarded-for IP is captured as a header value. Existing scoped screening/Hits/MR/Intake workflows write attributable business audit events. No raw session token is emitted in the reviewed denial audit payload. Live audit persistence and privacy redaction are **NOT YET VERIFIED**.

**5. Regression/CI.** `frontend/scripts/verify-cleanup-sprint4-literature.ts` now checks Review worklist/Review mutation scope and existing denial markers. [Current frontend quality gate](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38073459218) at `2074fc3b` needs completed-success confirmation. These are static source contracts, not exhaustive live security penetration or row-level database tests.

**Disposition:** **IN PROGRESS — confirmed cross-client vulnerabilities fixed in source; static CI underway.** Do not certify all negative security checks or production deployment from source assertions alone.
