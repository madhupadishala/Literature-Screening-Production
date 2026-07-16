# Literature Completion Progress

## 2026-07-16

- Completed: corrected the Qdrant search-filter typing in `frontend/lib/knowledge/vector/qdrant-knowledge-client.ts`. Single-value category and regulation filters now use the Qdrant `match.any` shape, consistent with the tenant and tag filters.
- Verification: `npm.cmd exec -- tsc --noEmit --incremental false` and `npm.cmd run build` pass. `npm.cmd run lint` remains blocked by 53 pre-existing errors and 14 warnings outside this change.

- In progress: hardening `POST /api/workflow/run` by validating identifiers, verifying the package exists, and passing parameters to Python without source interpolation.
- Completed: hardened `POST /api/workflow/run`. It rejects unsafe identifiers, returns 404 for missing packages, and passes validated values as Python arguments. Type-check and production build pass. Local `next start` exited before binding a port in this execution environment, so HTTP runtime verification was unavailable.

- In progress: replacing the static workflow-list records with package state from `evidence_store/demo-tenant`.
- Completed: `GET /api/workflow/list` now derives items and summary metrics from persisted evidence-package metadata, state, Hits, and Screening JSON rather than mock records. Type-check and production build pass; `next start -p 3010` reached Ready state.

- In progress: validating package identifiers in the existing workflow detail and download routes.
