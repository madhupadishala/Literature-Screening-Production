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
