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
