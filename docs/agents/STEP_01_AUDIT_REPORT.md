# Step 01 — Nexus 17-Agent Code Audit (2026-10-09)

**Audit disposition: COMPLETE as a source/code-level baseline.** This is not a clinical accuracy certification and does not authorize autonomous release.

## Verified sources
- 8 specialist implementations: `nexus_actual_agent_source_consolidation/packages/pv_specialist_core/nexus_pv_agents/nexus_agents/agents/`
- 5 context implementations: `nexus_actual_agent_source_consolidation/packages/v2_5/nexus_agents_v2/nexus_agents/`
- Drug role: `backend/agents/drug_role/nexus_agent.py`
- Country of incidence: `frontend/lib/ai/coi/coi-agent.ts`
- Adverse-event extraction: `backend/agents/event_runtime/engine.py` on **feat/event-extraction-agent** (diverged, NOT imported)
- Literature safety: `frontend/lib/pv-safety-assessment/assessment-engine.ts` on **feat/pv-safety-assessment-engine-v1** (diverged, NOT imported)

17 of 17 source entry points located. Of these, 15 are currently on the integration branch and 2 reside on divergent branches.

## Clinical/technical baseline observations
1. AgentResult and context-agent Pydantic schemas are not interchangeable.
2. Five context agents require an LLM provider; the shared specialist service does not register them.
3. LangGraph workflow covers only a subset of specialist capabilities.
4. `KnowledgeRouter` uses Chroma collection and product/country JSON files; verified live tenant-scoped retrieval evidence is absent.
5. Current specialist bridge asks for GLOBAL agent knowledge scope; least-privilege agent scoping needs correction.
6. Agent bridge can assess an ICSR without previously extracted canonical drugs/events; unknown does not mean clinically absent.
7. Medical history, historical condition and current-drug responsibilities overlap.
8. Event-extraction and safety-engine source are on divergent branches, requiring **selective** import instead of merge.
9. COI uses TypeScript LangGraph; imported clinical specialists use Python LangGraph; inter-runtime contracts need verification.
10. Historical safety engine explicitly reports seven knowledge gaps, plus seriousness, and controlled-knowledge conflicts.

See `step-01-code-audit.json` for individual entrypoints, risks, defects, overlap matrix and source refs.

## Reproducible CI baseline
At commit `e7e1ae59ba6a8e91748d011bdd915711583a47ac`:
- PV Specialist Agent Integration: **success**
- Shared PV Agent Quality Gate: **success**
- ClinixAI Frontend Quality Gate: **success**
- Cleanup Baseline Benchmark: **failure**

These existing historical CI results establish a **mixed** baseline. They do not mean that all 17 standalone agent tests passed, nor that live clinical datasets were used.

## Step 01 completion criteria
- Source identification: **17/17 verified**, including source branch for each
- Each agent assigned a concrete entrypoint and a first-pass clinical risk assessment: **yes**
- Cross-agent overlap and architecture dependency register: **yes**
- Commit-linked quality gate evidence: **yes, mixed results**
- Defects mapped to downstream correction/integration stages: **yes**

No source code was ported from diverged branches and no Step 02 clinical logic corrections were made as part of this audit.
