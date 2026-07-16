# Repository Map

Audit scope: 15 July 2026. Application code was read only; the only files created by this audit are these three reports. `node_modules`, `.git`, `.next`, and Python bytecode were excluded from source counts.

## Inventory

The repository contains **563 non-generated files**: 245 `.ts`, 105 `.tsx`, 101 `.py`, 25 `.json`, 22 `.md`, 17 `.gitkeep`, 10 `.css`, 8 extensionless files, 8 `.bin`, 5 `.svg`, 2 each `.mjs`, `.yml`, `.sqlite3`, `.txt`, and `.gitignore`, plus 1 each `.yaml`, `.disabled`, `.prettierignore`, `.xml`, `.editorconfig`, `.ico`, and `.tsbuildinfo`.

| Area | Contents |
|---|---|
| `frontend/` | Next.js 16 / React 19 web application; 19 pages, 62 route handlers, 245 TS and 105 TSX files. |
| `backend/` | Python literature workflow: agents, services, models, knowledge, orchestration and APIs. |
| `apps/literature/` | Legacy Streamlit workspace views. |
| `nexus_platform/` | Streamlit platform kernel, router, session/auth/state and styles. |
| `components/`, `assets/`, `models/`, `providers/`, `services/` | Legacy Streamlit shared UI, CSS, domain models and PubMed service/provider. |
| `knowledge/`, `backend/knowledge/` | Tenant products/countries, rules, SOP structure and product/search data. |
| `evidence_store/` | Demo evidence packages and generated workflow outputs. |
| `docs/` | Architecture, data-flow and operating-context documents. |
| `engines/` | Placeholder engine locations plus one `search_engine.py`. |
| `tests/` | Empty placeholder directory; four root-level test/validation scripts. |

`backend/engines/product_detection/product_detection_engine.py` is visible as a path but access to the file was denied by the environment, so it could not be inventoried or parsed. This is an audit limitation, not evidence of a source error.

## Frontend pages

- `/` — `frontend/app/page.tsx`
- `/admin`, `/admin/audit-logs`, `/admin/client-configuration`, `/admin/knowledge-base`, `/admin/literature-calendar`, `/admin/products`, `/admin/super-user-console`, `/admin/system-settings`, `/admin/users-roles`
- `/hits`, `/login`, `/reports`, `/screening`, `/tenant-management`, `/test-console`
- `/workflow`, `/workflow/[packageId]`

The frontend also exposes 62 API route handlers under `frontend/app/api`, including literature capabilities (`article-fetch`, `document-processing`, `duplicates`, `evidence-normalization`, `global-sources`, `pubmed/search`, `search-strategy`, `translation`) and workflow handlers (`run`, `list`, `package/[packageId]`, `timeline`, `download/[packageId]/[fileType]`).

## Backend modules

| Package | Modules / purpose |
|---|---|
| `backend.agents` | PubMed search, article/full-text fetching, search builder, product resolver; deterministic hits and screening orchestrators. |
| `backend.services` | Article canonicalization; author/country/MAH, product, PII, confidence, QC, hits, screening and intake builders. |
| `backend.workflow` | `LiteratureWorkflow` and JSON-file status manager. |
| `backend.api` | Current screening API and a legacy LLM-based package runner. |
| `backend.knowledge` | File-backed rules/product retrieval and context-pack assembly. |
| `backend.orchestrators` | Separate Groq/LLM hits, screening and intake implementations. |
| `backend.models` | Canonical article and facts data models. |

## Deliberate/accidental duplicates

1. **Two package runners:** `backend.workflow.literature_workflow.LiteratureWorkflow` (deterministic, used by Next workflow route) and `backend.api.run_screening_package.run_package` (Groq/LLM stack).
2. **Two hits and screening orchestrator families:** `backend.agents.hits|screening` versus `backend.orchestrators.hits_orchestrator|screening_orchestrator`.
3. **Two intake builders:** `backend.services.intake_input.IntakeInputBuilder` versus `backend.orchestrators.intake_input_builder.IntakeInputBuilder`.
4. **Two UI stacks:** current Next.js frontend and legacy Streamlit `apps/literature` workspaces.
5. **Three workflow representations:** Python file-backed package state, Next workflow API mock records, and TypeScript in-memory pipeline history.

These are materially overlapping implementations, not merely shared abstractions. There is no single declared production owner.

## Source-control state

The working tree was already dirty before this audit: modified workflow/backend/frontend files and many untracked backend and frontend additions were present. No existing files were changed by the audit.
