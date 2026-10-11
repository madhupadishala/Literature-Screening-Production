# Nexus Step 2 — Drug Extraction and AE Extraction implementation checkpoint

**Status: IN PROGRESS, NOT CLOSED.**
**Clinical policy approval:** all 35 requirements explicitly approved by the Nexus clinical owner.
**Runtime database activation:** 0/35; original draft rows contain non-executable placeholders, which are intentionally prevented from being approved.

## Drug Extraction / Classification

- `backend/agents/drug_role/orchestrator.py`: DR-009 company ownership matching is now **SUSPECT-only**; concomitant, treatment and historical drugs are not labeled company suspect.
- `backend/agents/drug_role/rules.py`: DR-003 preserves an explicitly reported AE-treatment role when a separate subsequent event is also attributed to the same drug. This does not automatically create another ICSR.
- `backend/agents/drug_role/exposure_policy.py`: DR-004, DR-005, DR-006, DR-007, DR-008, DR-011 source-validated exposure normalization; separate regimens, strength/form-based product records, no route-to-formulation inference, repeated historical intervals, brand/generic defaults.
- `backend/agents/drug_role/nexus_agent.py`: the actual NexusDrugRoleAgent now invokes exposure normalization when a source extraction supplies `validated_drug_exposures`; output includes `exposure_products` and the applied-rule IDs.
- Tests: `tests/test_drug_role_policy_integration.py` and `tests/test_drug_exposure_policy.py`.

## AE Extraction

- The actual event extraction engine and its supporting source modules were selectively imported from `feat/event-extraction-agent` onto the integration branch, preserving existing source offsets and verifier behavior.
- `backend/agents/event_runtime/engine.py`: applies AE-002 laboratory-observation human-review guard and AE-004 figurative-death guard during verified mention processing.
- AE-001 separately reported rash and itching remain distinct events; regression test checks independent records.
- `backend/agents/event_runtime/outcome_policy.py`: AE-006 maps explicitly quoted improved/recovered/no-improvement language to outcome classifications while preserving the reported text; output event contract includes `outcome`.
- Existing source-span checks support AE-005. AE-003 and AE-009 have deterministic standalone gates but have NOT been wired through the actual event runtime.
- Tests: `tests/test_event_clinical_agent_integration.py`, `tests/test_event_outcome_policy.py`, `tests/test_executable_clinical_gates.py`.

## Remaining essential work

1. Complete source-grounded clinical rule execution for unimplemented Drug and AE rules: vaccine exposure history, client ownership exceptions, special formulations/territory, event dates/relative precision, coding-policy scope, colloquial NLP, outcomes and chronology edge cases.
2. Connect rule evaluation to approved database revisions and agent-specific scoped KnowledgeRouter retrieval; currently agent logic is code-level, while the 35 persistent Neon records remain draft policy inventory placeholders.
3. Fully run evidence-driven tests against the event extraction engine with actual document sources, OCR and E2B inputs; live model and independent clinical reference qualification are not demonstrated.
4. Complete remaining approved clinical rule domains: Action Taken, Dechallenge, Rechallenge, Day Zero and Medical History.
5. Complete final CI for the latest commit, source-to-rule traceability, clinical expert acceptance evidence, and integration qualification before marking 35/35 executable or activating policies.

**Do not claim all 35 are activated, that production is deployed, or that clinical qualification is finished.**
