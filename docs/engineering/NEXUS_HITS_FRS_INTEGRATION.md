# NEXUS Literature Screening — Hits FRS Integration

Status: IN PROGRESS. Branch: `feature/nexus-hits-frs-integration`.

Approved UI: one Hits subtab with three collapsible parents — Duplicate Check (criteria + results), Hits Manual Search (criteria + results), Hits Queue (multifilter grid + review drawer). No separate Quality Review page. Duplicate decision: Yes=duplicate/blocked, No=not duplicate/eligible Add, Re-review=pending/blocked. Require an Add reason. Queue Review Completed moves to Screening only after mandatory-field validation; AI Re-review must preserve earlier decisions. Scheduled ingestion must prevent duplicate queue insertion. Display safety evidence and rationale on hover/focus.

Integration constraints: retain existing authenticated `ApplicationShell` and tenant/client isolation; do not bypass AuthGate; preserve the current API-backed Hits implementation; use synthetic data solely in clearly marked development previews; do not present simulated actions as persisted workflow changes; do not deploy or merge into `main` until verified.

Implementation pending: import the approved Storybook `HitsWorkspace.tsx` and its CSS and story into the integration branch, create a feature-gated route adapter, wire real services and verify TypeScript, ESLint, build, RBAC, tenant isolation, workflow transitions, audit, and UI acceptance tests. The branch creation and this specification alone do not mean the application UI has been integrated or deployed.
