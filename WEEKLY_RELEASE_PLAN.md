# NEXUS WEEKLY RELEASE PLAN
## November 10 - December 20, 2026 | 6 Weeks to Production

**Owner**: CTO Office  
**Status**: ACTIVE — Execution Baseline  
**Principle**: One module live per week. No exceptions. Ship every Friday.

---

## CURRENT STATE SNAPSHOT (as of Nov 9)

| Component | Status | Blockers |
|-----------|--------|----------|
| **Phase 2 Agents (1-9)** | ✅ Implemented in `lib/agents/` | Need golden test cases |
| **BaseAgent + Router + Ledger + ZDR** | ✅ Core infrastructure complete | Redis connection config |
| **RBAC Unified System** | ✅ Types/guards built | Not wired into API layer |
| **Service Contracts + Adapters** | ✅ 4 contracts, 5 adapters | API routes use legacy code |
| **Design System** | ✅ Tokens + 6 components | Legacy components not migrated |
| **Eval Harness** | ✅ Framework + runner | Zero golden test cases exist |
| **Missing AG Agents (4)** | ❌ AG07, AG16, AG25, AG27 | Source missing |
| **Canonical AG → lib/agents** | ❌ 10 agents need migration | Manual wrapping effort |

---

## WEEKLY RELEASE CADENCE

### WEEK 1 (Nov 10-14) → **MODULE: LITERATURE SCREENING CORE**
**Ship Friday Nov 14**: Agent-4 screening end-to-end with golden tests

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Create golden test cases for agent-4 (20 cases) | Tech Lead Agents | JSON in `evals/golden/agent-4-screening.json` |
| Tue | Wire unified RBAC into `/api/ai/screening` route | Tech Lead Platform | `requirePermission` uses unified guard |
| Wed | Migrate screening route to adapter pattern | Tech Lead Platform | Uses `createScreeningService()` adapter |
| Thu | Run eval harness: agent-4 ≥95% pass rate | QA/Eval Lead | `npx tsx evals/runner.ts --agent agent-4-screening` |
| Fri | **RELEASE**: Agent-4 live, docs updated, canary registered | CTO | All gates pass |

**Dependencies**: Redis running, `AGENTIC_AI_API_URL` configured
**Risk**: Legacy `screening-agent.ts` coupling — mitigate by feature flag

---

### WEEK 2 (Nov 17-21) → **MODULE: INTAKE & TRIAGE PIPELINE**
**Ship Friday Nov 21**: Agent-14 (intake triage) + Agent-15 (drug extraction) + Agent-16 (reporter ID) + Agent-17 (clock start)

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Wrap AG26 canonical → `agent-14-intake-triage.ts` | Tech Lead Agents | Extends BaseAgent, passes capabilities check |
| Tue | Wrap AG01 canonical → `agent-15-drug-extraction.ts` | Tech Lead Agents | Same pattern |
| Wed | Wrap AG04 canonical → `agent-16-reporter-id.ts` | Tech Lead Agents | Same pattern |
| Thu | Wrap AG09 canonical → `agent-17-clock-start.ts` | Tech Lead Agents | Same pattern |
| Fri | **RELEASE**: 4 agents live, golden tests (5 each), intake workflow integrated | CTO | E2E intake→triage→case creation works |

**Dependencies**: Week 1 complete, canonical AG sources verified
**Risk**: Missing AG07/16/25/27 not in this batch — deferred to Week 6

---

### WEEK 3 (Nov 24-28) → **MODULE: CASE PROCESSING CORE**
**Ship Friday Nov 28**: Agents 2,3,5,6,7,8,9,10,11,12 (10 agents = case workflow complete)

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Golden tests for agents 2,3,5,6,7,8 (5 each = 30 cases) | QA/Eval Lead | JSON files in `evals/golden/` |
| Tue | Golden tests for agents 9,10,11,12 (5 each = 20 cases) | QA/Eval Lead | Causality, listedness, country, safety-detection |
| Wed | Migrate AG13 → `agent-9-causality` (already exists, verify) | Tech Lead Agents | Verify Bradford Hill implementation |
| Thu | Migrate AG12 → `agent-10-listedness`, AG08 → `agent-11-country`, AG17 → `agent-12-safety-detection` | Tech Lead Agents | Wrap canonical sources |
| Fri | **RELEASE**: Full case workflow live, 10 agents, regression baseline captured | CTO | `npx tsx evals/runner.ts` all 19 agents pass |

**Dependencies**: Weeks 1-2 complete, AG13/12/08/17 canonical sources ready
**Risk**: 10 agents in 1 week — mitigate by parallelizing wrapping (4 engineers)

---

### WEEK 4 (Dec 1-5) → **MODULE: SUBMISSIONS & E2B**
**Ship Friday Dec 5**: Agent-13 (narrative gen) + E2B XML generation + Gateway adapters

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Wrap AG20 → `agent-13-narrative-gen.ts` | Tech Lead Agents | Extends BaseAgent, E2B XML output |
| Tue | Build E2B R3 XML generator (lib/submissions/e2b-generator.ts) | Tech Lead Platform | ICH E2B R3 compliant, schema validated |
| Wed | Gateway adapters: FDA ESG, EMA EVHUMAN, PMDA | Tech Lead Platform | 3 adapters, contract-first |
| Thu | Golden tests for agent-13 + E2B (10 cases) | QA/Eval Lead | Narrative quality + XML validity |
| Fri | **RELEASE**: Submission-ready, gateway adapters registered | CTO | End-to-end: case → narrative → E2B → gateway |

**Dependencies**: Week 3 complete (case workflow feeds submissions)
**Risk**: E2B complexity — mitigate by using existing `nexus_actual_agent_source_consolidation` E2B code

---

### WEEK 5 (Dec 8-12) → **MODULE: RESILIENCE PLATFORM**
**Ship Friday Dec 12**: AgentPoolManager + Multi-provider Router + Checkpointing + Synthetic Canaries

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Harden `agent-pool-manager.ts`: HPA integration, pod replacement <30s | Tech Lead Platform | K8s manifests, health endpoint <100ms |
| Tue | Harden `hybrid-inference-router.ts`: CLOUD→LOCAL→HEURISTIC→DLQ failover <500ms | Tech Lead Platform | Circuit breakers tuned, 4-tier tested |
| Wed | Merkle checkpointing: persist every 5 spans, resume on replacement | Tech Lead Platform | Integration test: kill agent mid-execution → resume |
| Thu | Deploy 5 synthetic canaries (liveness, E2E screening, failover, audit, ZDR) | QA/Eval Lead | Alerting rules, error budget burn rate |
| Fri | **RELEASE**: 99% uptime infrastructure live, dashboards in Grafana | CTO | Chaos test: kill pod, kill LLM, kill Redis — all recover |

**Dependencies**: Weeks 1-4 agents running (need real traffic for canaries)
**Risk**: K8s access — mitigate by using local Kind cluster for validation

---

### WEEK 6 (Dec 15-19) → **MODULE: EVAL HARNESS + LEGACY MIGRATION + MISSING AGENTS**
**Ship Friday Dec 19**: Golden sets complete, regression CI, AG07/16/25/27 built

| Day | Deliverable | Owner | Criteria |
|-----|-------------|-------|----------|
| Mon | Golden test cases: all 21 agents ≥20 cases each (420 total) | QA/Eval Lead | Coverage: critical paths, edge cases, adversarial |
| Tue | Code-based metrics: schema validation, tool selection, latency budgets | QA/Eval Lead | Automated in CI pipeline |
| Wed | LLM Judge framework: groundedness, correctness, tone rubrics | QA/Eval Lead | `evals/llm-judge.ts` integrated |
| Thu | Build missing agents: AG07→18-lab-data, AG16→19-aesi, AG25→20-icsr-validity, AG27→21-patient-aggregate | Tech Lead Agents | 4 new agents, minimal viable, heuristic tier first |
| Fri | **RELEASE**: Complete agent ecosystem (21 agents), eval CI gate, regression detection | CTO | All gates pass, zero critical regressions |

**Dependencies**: Week 5 infra for eval runs
**Risk**: 4 new agents in 1 day — mitigate by building heuristic-only versions first, LLM later

---

## RELEASE GATES (Every Friday — Automated in CI)

| Gate | Check | Pass Criteria | Owner |
|------|-------|---------------|-------|
| **Code** | `npm run typecheck:lib` | 0 errors | Tech Lead |
| **Tests** | Unit + E2E | ≥90% coverage, all pass | QA Lead |
| **Eval** | Golden set accuracy | ≥95% per agent | QA Lead |
| **Audit** | Merkle chain verify | 0 broken links | Compliance |
| **Perf** | P99 latency | Within agent budget | Platform Lead |
| **Security** | SAST/DAST/secrets | Clean scan | Security |
| **Docs** | Spec + runbook + API | Updated for released agents | Tech Lead |

**Gate Enforcement**: CI pipeline blocks merge on any failure. No manual overrides.

---

## TEAM ASSIGNMENTS

| Role | Person | Focus Weeks |
|------|--------|-------------|
| **CTO** | [You] | All — release approval, architecture decisions, unblock |
| **Tech Lead (Agents)** | [Assign] | Weeks 1-4, 6 — agent implementation, wrapping, eval |
| **Tech Lead (Platform)** | [Assign] | Weeks 1, 3-5 — infra, router, pool manager, K8s |
| **QA/Eval Lead** | [Assign] | All — golden cases, eval harness, canaries, regression |
| **Compliance** | [Assign] | Weeks 1, 4, 5 — 21 CFR Part 11, audit trail, E2B |
| **On-Call** | [Rotate] | Weeks 5-6 — canary alerts, error budget burns |

---

## DEPENDENCY GRAPH (Critical Path)

```
Week 1 (Screening Core)
    │
    ├──→ Week 2 (Intake/Triage) ──→ Week 3 (Case Processing)
    │                                    │
    │                                    ├──→ Week 4 (Submissions)
    │                                    │
    │                                    └──→ Week 5 (Resilience) ← Needs real agents
    │
    └──→ Week 6 (Eval + Missing) ← Needs Week 5 infra
```

**No parallelization across weeks** — each week depends on prior week's release.

---

## BLOCKERS & MITIGATIONS

| Blocker | Likelihood | Impact | Mitigation |
|---------|------------|--------|------------|
| **Redis not configured** | High | Week 1 blocked | Day 1 Mon: Provision Redis, test ZDR store connection |
| **AGENTIC_AI_API_URL not set** | High | Week 1 blocked | Day 1 Mon: Deploy Agentic_AI to localhost:8001 or set env |
| **Golden test cases missing (0 exist)** | Critical | All weeks | Week 1 Mon-Tue: 2 engineers full-time writing 20 cases/agent |
| **Canonical AG sources incomplete** | Medium | Weeks 2-3 | Audit each AG canonical folder Day 1 Mon; defer gaps to Week 6 |
| **K8s cluster access** | Medium | Week 5 | Use Kind local cluster; defer prod K8s to post-launch |
| **LLM provider credentials** | Low | Weeks 1, 3, 6 | Default to LOCAL (llama.cpp) for CI; CLOUD only for production |
| **E2B XML complexity** | Medium | Week 4 | Leverage existing `nexus_actual_agent_source_consolidation` E2B code |

---

## DAILY STANDUP FORMAT (15 min, 9am)

```
1. What shipped yesterday? (Demo if Friday)
2. What ships today?
3. Blocker? → CTO unblocks immediately
4. Gate status for Friday? (Green/Yellow/Red)
```

---

## WEEK 1 EXECUTION CHECKLIST (Start Today)

- [ ] **Today**: Provision Redis, verify `lib/infrastructure/redis-zdr-store.ts` connects
- [ ] **Today**: Set `AGENTIC_AI_API_URL=http://localhost:8001` (or deployed endpoint)
- [ ] **Today**: Verify `npx tsx evals/runner.ts --agent agent-4-screening` runs (mock mode)
- [ ] **Mon**: Write 20 golden cases for agent-4 (PMID, title, abstract, expected decision)
- [ ] **Mon**: Audit unified RBAC — list all `requirePlatformPermission` call sites
- [ ] **Tue**: Refactor `/api/ai/screening/route.ts` to use unified guard + adapter
- [ ] **Wed**: Run eval harness, fix failures until ≥95%
- [ ] **Thu**: Register agent-4 canary (30s liveness, 60s E2E screening)
- [ ] **Fri**: **RELEASE** — tag `v0.1.0-screening-core`, update runbook, notify stakeholders

---

## SUCCESS METRICS (Track Weekly)

| Metric | Week 1 Target | Week 6 Target |
|--------|---------------|---------------|
| Agents live | 1 | 21 |
| Golden test cases | 20 | 420+ |
| Eval pass rate | ≥95% | ≥95% all agents |
| P99 latency (agent-4) | <10s | <budget all agents |
| Uptime (canary) | N/A | 99% |
| Merkle chain integrity | 100% | 100% |
| Critical regressions | 0 | 0 |

---

## ESCALATION PATH

| Level | Trigger | Action |
|-------|---------|--------|
| **Yellow** | Gate at risk Thursday | CTO + Tech Leads war room, scope cut if needed |
| **Red** | Gate fails Friday | No release. Root cause Monday. Plan adjustment. |
| **Black** | Infrastructure down >1hr | Page on-call, all hands, status page update |

---

**This plan is executable. Every deliverable has an owner, a day, and a pass/fail criterion. No vague "work on" items. Ship or escalate.**

**Next Action**: CTO assigns 6 roles above by EOD today. Week 1 starts Monday 9am.