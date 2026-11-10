# Agentic_AI Consolidation Decision Log
**Date:** 2026-11-06  
**Decider:** CTO (Claude)  
**Status:** **PHASE 1-3 COMPLETE** ✅

---

## Branch Inventory & Decisions

| Agent | Branches Found | Decision | Rationale |
|-------|---------------|----------|-----------|
| AG01 | (flat - `src/backend/`) | **KEEP as-is** | Already canonical, no branches |
| AG02 | `feat__event-extraction-agent` | **KEEP** | Only branch, 14 files, native runtime |
| AG03 | `v2_5` (flat) | **KEEP as-is** | Versioned, has v25 binding |
| AG04 | `v2_5` (flat) | **KEEP as-is** | Versioned, has v25 binding |
| AG05 | `integration__nexus-agent-five-steps-20261011` | **KEEP** | Only branch, named for Nexus integration |
| AG06 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG07 | MISSING | **DEFER** | `source_missing` in registry - create stub later |
| AG08 | `consolidate__nexus-shared-agents` | **KEEP** | Only branch, consolidate pattern |
| AG09 | `v2_5` (flat) | **KEEP as-is** | Versioned, has v25 binding |
| AG10 | `consolidate__nexus-shared-agents` | **KEEP** | Only branch, consolidate pattern |
| AG11 | (flat - `src/backend/`) | **KEEP as-is** | Native pipeline, verified deps |
| AG12 | `consolidate__nexus-shared-agents` | **KEEP** | Only branch, consolidate pattern |
| AG13 | (flat - `src/backend/`) | **KEEP as-is** | Native pipeline, comprehensive |
| AG14 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG15 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG16 | MISSING | **DEFER** | `source_missing` in registry |
| AG17 | `feat__pv-safety-assessment-engine-v1`<br>`feat__safety-assessment-consolidation-20261008` | **KEEP: `feat__safety-assessment-consolidation-20261008`** | Newer, "consolidation" in name, has governed-orchestrator.ts |
| AG18 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG19 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG20 | `consolidate__nexus-shared-agents` | **KEEP** | Only branch, consolidate pattern |
| AG21 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG22 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG23 | `kimi8` (flat) | **KEEP as-is** | Only implementation, kimi8 pattern |
| AG24 | `v2_5` (flat - has `current/` + `history/`) | **KEEP as-is** | Two engines under one version |
| AG25 | MISSING | **DEFER** | `source_missing` in registry |
| AG26 | `consolidate__nexus-shared-agents` | **KEEP** | Only branch, consolidate pattern |
| AG27 | MISSING | **DEFER** | `source_missing` in registry |

---

## Actions Taken ✅

### Phase 1: Move Kept Branches to `src/canonical/` ✅
- ✅ AG02: Move `src/branches/feat__event-extraction-agent/` → `src/canonical/`
- ✅ AG05: Move `src/branches/integration__nexus-agent-five-steps-20261011/` → `src/canonical/`
- ✅ AG08: Move `src/branches/consolidate__nexus-shared-agents/` → `src/canonical/`
- ✅ AG10: Move `src/branches/consolidate__nexus-shared-agents/` → `src/canonical/`
- ✅ AG12: Move `src/branches/consolidate__nexus-shared-agents/` → `src/canonical/`
- ✅ AG17: Move `src/branches/feat__safety-assessment-consolidation-20261008/` → `src/canonical/` (merged unique from v1)
- ✅ AG20: Move `src/branches/consolidate__nexus-shared-agents/` → `src/canonical/`
- ✅ AG26: Move `src/branches/consolidate__nexus-shared-agents/` → `src/canonical/`

### Phase 2: Delete All `src/branches/` Directories ✅
- ✅ Delete AG02/src/branches/
- ✅ Delete AG05/src/branches/
- ✅ Delete AG08/src/branches/
- ✅ Delete AG10/src/branches/
- ✅ Delete AG12/src/branches/
- ✅ Delete AG17/src/branches/
- ✅ Delete AG20/src/branches/
- ✅ Delete AG26/src/branches/

### Phase 3: Update Registries ✅
- ✅ Update `integration_registry.json` with canonical paths & `old_paths_retired: true`
- ✅ Update `agent_context_registry.json` with canonical paths

### Phase 4: Handle Missing Agents (AG07, AG16, AG25, AG27) ⏳ PENDING
- [ ] Create minimal stub implementations
- [ ] Update registry status to `source_present_not_runtime_verified`

---

## Files Modified
- `Agentic_AI/AG02_Adverse_Event_MedDRA/src/canonical/` (created)
- `Agentic_AI/AG05_Indication_Identification/src/canonical/` (created)
- `Agentic_AI/AG08_Country_of_Incident/src/canonical/` (created)
- `Agentic_AI/AG10_Translation/src/canonical/` (created)
- `Agentic_AI/AG12_Listedness_Expectedness/src/canonical/` (created)
- `Agentic_AI/AG17_Safety_Information_Detection/src/canonical/` (created + merged v1 files)
- `Agentic_AI/AG20_Narrative_Generation/src/canonical/` (created)
- `Agentic_AI/AG26_Intake_Triage/src/canonical/` (created)
- `Agentic_AI/integration_registry.json` (updated 8 agents + notes)
- `Agentic_AI/shared/agent_context_registry.json` (updated 8 agents' implementation paths)
- `AGENT_CONSOLIDATION_LOG.md` (this file)

---

## Verification
```
✅ 8 agents consolidated to canonical paths
✅ 8 branches directories deleted (~150+ duplicate files removed)
✅ 2 registries updated with canonical paths
✅ AG17 merged: governed-orchestrator.ts + assessment-engine.ts + seriousness-engine.ts + types.ts
```

---

## Next Steps (P1: RBAC Unification)
1. Create `lib/rbac/unified-permissions.ts`
2. Create `lib/rbac/unified-roles.ts`
3. Create `lib/rbac/unified-guard.ts`
4. Rewrite `lib/rbac/guard.ts`
5. Extend `lib/rbac/request-principal.ts`
6. Delete `lib/nexus/platform-rbac.ts`
7. Add migration `043_platform_roles.sql`