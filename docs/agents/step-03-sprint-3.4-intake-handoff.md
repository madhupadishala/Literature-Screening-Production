# Sprint 3.4 — Literature-to-Intake handoff reconciliation

**Status:** STARTED — source-level baseline assessment. No runtime PASS, no claim of full sprint closure.

## Controlled requirements
URS-LIT-050–053, 070–073, 080–082; FRS-LIT-011, 017–018. Preserve existing Hits → Screening → MR → Intake workflow. Shared specialist AI integration remains deferred to the consolidated phase.

## Verified code presence (not yet runtime qualified)
| Concern | Evidence | Observation | Gate |
|---|---|---|---|
| Canonical schema | `frontend/lib/literature/intake-input/intake-input-types.ts` | `clinixai.literature.intake-input.v1` constant; export version | Contract compatibility to downstream still to be checked |
| Authorization | `frontend/app/api/literature/intake-input/route.ts`; `[exportId]/route.ts` | Distinct `INTAKE_INPUT_GENERATE` and `INTAKE_INPUT_DOWNLOAD` guarded routes | Negative tests later |
| Scoped source selection | `frontend/lib/literature/intake-input/intake-input-service.ts` | Tenant/workspace/environment-scope in generation query and download query | Runtime isolation later |
| MR prerequisites | `frontend/lib/literature/intake-input/intake-input-governance.ts` | Gated to approved Hits + INCLUDE screening + patient segmentation + governed assessment + approved MR | Regression later |
| Article/source provenance | `intake-input-service.ts` | Article identity, package source records with PMID/DOI, Hits, screening, review and duplicate intelligence included | Compare consumer contract |
| Export idempotency | `intake-input-service.ts` | Locks package and workflow rows, SHA-256 of upstream lineage; retrieves existing export for same scope/lineage | Repeated/concurrent generation SQL tests later |
| Evidence and audit | `intake-input-service.ts` | SHA-256, evidence_artifacts, generated-by, timestamp and audit event persisted transactionally | Tamper check later |

## Next engineering sequence
1. Locate actual downstream Nexus Common Intake consumer and compare schema/required keys to `clinixai.literature.intake-input.v1`.
2. Inspect lineage hash, duplicate source identity and repeated export behavior for demonstrable defects.
3. Review workspace-scoped generation and download guards, finalized MR prerequisite, audit and error outcomes.
4. Add targeted contract/negative regression checks, run Frontend CI and isolated PostgreSQL verification where warranted.
5. Commit change impact, URS/FRS evidence, CI run ID and formally close Sprint 3.4 only when engineering gates pass.

No replacement pipeline, private-table coupling or live specialist-agent integration is authorized by this sprint.

## Implementation update — consumer contract hardening

Actual downstream route: `frontend/app/api/safety/intake/literature/route.ts` with `INTAKE_CREATE`, forwarding only the export ID to `importLiteratureIntakeExport` in `frontend/lib/safety/common/safety-backbone-service.ts`. The importer uses a tenant/workspace/environment-filtered `FOR UPDATE` query, reuses an already linked Intake record and records a linked source evidence artifact. Source adapter: `frontend/lib/safety/common/literature-intake-adapter.ts`.

**Confirmed defect corrected:** The adapter accepted a structured payload without checking its schema identifier, export ID/version correspondence, or that a human-approved completed MR and INCLUDE screening were present inside the document. These fields are now checked fail-closed at the Intake consumer boundary (commit `8b973e26`). Source-contract regression assertions were added to existing frontend CI script `verify-cleanup-sprint4-literature.ts` (commit `2adef966`).

**Preserved:** Existing versioned export schema, SHA-256 lineage reuse, transaction scope, source article and PMID/DOI, clinical assessment payload, audit trail, and downstream shared Intake adapter.

**Verification:** CI at [run 38063423944](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38063423944) (check run conclusion). This is static code/CI verification, not a claim of replayed full literature-to-Intake UAT. Formal Sprint 3.4 closure remains conditional on passing current frontend CI and contract/lineage test disposition.

## Engineering closure record — 2026-10-10

**Status: CLOSED — scope-specific source contract and frontend engineering CI passed.** This does not claim a separately executed full database literature-to-Intake end-to-end run or clinical qualification.

- Producer: `frontend/lib/literature/intake-input/intake-input-service.ts`, version `clinixai.literature.intake-input.v1`, SHA-256 lineage reuse, tenant/workspace/environment scoped row lock, preserved source/clinical provenance and export audit.
- Consumer: `frontend/app/api/safety/intake/literature/route.ts` → `frontend/lib/safety/common/safety-backbone-service.ts` → `frontend/lib/safety/common/literature-intake-adapter.ts`. Import validates `INTAKE_CREATE` authorization, scoped export lookup with row lock, prior-import reuse, and downstream source evidence link.
- Verified correction: reject unsupported schema, mismatched document export ID/version, unapproved medical review or non-INCLUDE screening at consumer boundary (`8b973e26`).
- Regression: existing `verify-cleanup-sprint4-literature.ts` now enforces producer/consumer contract markers and guards (`2adef966`). Existing `verify-nexus-sprint2.ts` fixture was aligned with the approved versioned export schema (`85ebc3cd`), after initial CI failed specifically due to an outdated fixture.
- **PASS**: [ClinixAI Frontend Quality Gate 38063574503](https://github.com/madhupadishala/Literature-Screening-Production/actions/runs/38063574503), head `85ebc3cd97e0356585c036bbfdcd78364e4b5bfc`. This includes the Nexus Sprint 2 handoff characterization, Literature source-contract checks and frontend production build.
- **Limitations:** no newly executed production tenant database consumer import/replay in this sprint, and no claim of live model clinical validation; these are maintained under later integrated qualification and release gates. Existing workflow intentionally preserved.

**Next:** Sprint 3.5 — authorization, tenant/workspace/environment isolation, negative access and audit hardening.
