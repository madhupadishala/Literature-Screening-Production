# Nexus shared-agent canonical source layer

This directory groups the **13 uploaded specialist source agents** into a single, stable repository location while preserving their original package import contexts. Additional existing Nexus agents remain under `backend/agents` and are **not yet migrated**.

- `vendor/kimi_8`: eight specialist modules and supporting orchestration, schemas and tests.
- `vendor/v2_5`: five extraction/context modules and supporting common code.
- `registry.py`: explicit 13-source inventory and collision-review entries.
- `tests/test_canonical_shared_agents.py`: deterministic source-presence and syntax check.

Original upload snapshots under `nexus_actual_agent_source_consolidation` remain untouched as provenance backups. No duplication of *running* services is introduced; importing the vendor packages is opt-in. These files must not be treated as a completed clinical runtime or evidence of accuracy.

## Closure gates

1. **Canonical source inventory:** 13 uploaded source implementations are colocated and source-mapped; yes. Existing `backend/agents` implementations not yet migrated.
2. **Contract normalization:** not complete; v2 and Kimi schemas have different shapes.
3. **Knowledge integration:** existing controlled KnowledgeRouter exists, but all 13 agents do not yet use it.
4. **Module adapters:** not complete; Literature/Intake/Case Processing contracts require verified invocation and role/tenant scope.
5. **Engineering tests:** offline source checks included; full integration and deployment checks not yet run.

Do not enable clinical auto-decisions, claim a unified set of 21 agents, or merge without passing CI and code review.
