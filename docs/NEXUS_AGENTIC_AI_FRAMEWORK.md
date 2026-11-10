# NEXUS Agentic AI Framework Specification

**Version**: 1.0  
**Date**: 2026-11-09  
**Status**: ACTIVE — Implementation Baseline  
**Owner**: CTO Office  

---

## 1. Framework Overview

This document defines the **complete Agentic AI Framework** for the Nexus Pharmacovigilance Platform. Every agent in the Nexus ecosystem MUST conform to this specification. No exceptions.

### 1.1 Design Principles

| Principle | Mandate |
|-----------|---------|
| **Deterministic by Default** | seed=42, temperature=0, fixed model hashes, reproducible outputs |
| **Audit-First** | Every execution → Merkle chain entry → 21 CFR Part 11 compliant |
| **Zero-Cost Architecture** | Local inference preferred, no paid API dependencies for core flows |
| **Resilience by Design** | Circuit breakers, tiered fallbacks (CLOUD→LOCAL→HEURISTIC→DLQ), self-healing |
| **Observability Native** | Structured logs, metrics, traces, evals built-in — not bolted on |
| **Compliance Embedded** | FDA 21 CFR Part 11, EU GVP Module VI, ICH E2B/E2D, GAMP 5 |

### 1.2 Five-Layer Alignment (from AI System Design Framework)

| Layer | Nexus Implementation |
|-------|---------------------|
| **1. Scope & Assumptions** | `AgentCapabilities` schema — explicit input/output contracts, tier support, latency budgets |
| **2. Architecture (KARC)** | **Know**: Product Gate + SLM + Knowledge Base<br>**Act**: Typed tools with permissions/blast-radius/failure-handling<br>**Remember**: ZDR Store (ephemeral) + Merkle Audit (permanent) + Trace Context<br>**Coordinate**: `BaseAgent` + Message Passing + `HybridInferenceRouter` + `AgentPoolManager` |
| **3. Observability** | `TelemetryService` (latency percentiles, circuit breaker health, agent metrics) + `AuditLedger` (immutable execution log) + **Eval Harness** (golden sets, code metrics, LLM judges) |
| **4. Production & Ops** | `AgentPoolManager` (HPA, health checks, auto-replace) + Multi-provider LLM Router + Merkle Checkpointing + Synthetic Canaries + Error Budgets |
| **5. Optimization** | Eval-driven model selection, prompt tuning, tier routing optimization, cost/latency/quality tradeoffs |

---

## 2. Agent Specification (Mandatory for ALL Agents)

### 2.1 Base Class Contract

Every agent **MUST** extend `BaseAgent` (`lib/agents/base-agent.ts`):

```typescript
// Required implementation
abstract execute(input: AgentExecutionInput): Promise<AgentResult>;

// Required metadata
abstract getCapabilities(): AgentCapabilities;

// Factory function (required)
export function create<AgentName>Agent(config: AgentFactoryConfig): BaseAgent;
```

### 2.2 AgentCapabilities Schema (Layer 1: Scope)

```typescript
interface AgentCapabilities {
  agent_id: AgentId;                    // Unique identifier
  name: string;                         // Human-readable
  description: string;                  // What it does
  input_schema: JSONSchema;             // Strict validation
  output_schema: JSONSchema;            // Strict validation
  supported_tiers: ('CLOUD'|'LOCAL'|'HEURISTIC'|'DLQ')[];  // Tier support
  required_services: string[];          // Infrastructure dependencies
  estimated_latency_ms: number;         // P99 budget
  max_concurrent: number;               // Concurrency limit
}
```

**No agent deploys without passing `getCapabilities()` validation.**

### 2.3 Execution Contract (Layer 2: KARC)

```typescript
interface AgentExecutionInput {
  correlation_id: string;               // Request tracing
  trace_context: TraceContext;          // Distributed tracing
  payload: T;                           // Validated against input_schema
  parent_message_id?: string;           // For chaining
  priority: 'low'|'normal'|'high'|'critical';
}

interface AgentResult<T = any> {
  success: boolean;
  agent_id: AgentId;
  trace_id: string;
  output?: T;                           // Validated against output_schema
  error?: string;
  execution_tier: 'CLOUD'|'LOCAL'|'HEURISTIC'|'DLQ';
  model_name?: string;
  model_hash?: string;                  // Reproducibility
  latency_ms: number;
  tokens_used?: number;
  merkle_entry_hash: string;            // Audit integrity
  execution_metadata: Record<string, any>;
}
```

### 2.4 Retry & Fallback Policy (Layer 4: Resilience)

```typescript
// BaseAgent provides — agents CAN override
max_retries: 3;                         // Exponential backoff: 1s, 2s, 4s
timeout_ms: 30000;                      // Hard timeout
enable_audit: true;                     // Merkle recording
deterministic_seed: 42;                 // Reproducibility

// Tier fallback (automatic via HybridInferenceRouter)
CLOUD → LOCAL → HEURISTIC → DLQ
```

### 2.5 Health Check Endpoint (Layer 4: Self-Healing)

Every agent **MUST** expose:

```typescript
interface AgentHealth {
  agent_id: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  last_heartbeat: number;               // Unix ms
  consecutive_failures: number;
  memory_mb: number;
  cpu_percent: number;
  active_executions: number;
  queue_depth: number;
  last_error?: string;
}
```

**Endpoint**: `GET /health` → returns `AgentHealth`  
**SLA**: Responds <100ms, fails after 3 consecutive misses → `AgentPoolManager` replaces.

---

## 3. Resilience Framework (99% Uptime Target)

### 3.1 Four-Tier LLM Redundancy

| Tier | Providers | Selection Logic | Availability Target |
|------|-----------|-----------------|---------------------|
| **CLOUD** | Anthropic (primary), OpenAI (secondary), Azure (tertiary) | Lowest latency + health score | 99.9% |
| **LOCAL** | vLLM (Qwen2.5-14b), Ollama (Llama3.1-8b), TGI (fallback) | GPU availability + model hash match | 99.5% |
| **HEURISTIC** | Deterministic rules (always available) | Zero dependencies | 100% |
| **DLQ** | Human review queue | Never fails | 100% |

**Router**: `HybridInferenceRouter` — health-scored, weighted, circuit-breaker aware.

### 3.2 Agent Pool Manager (Self-Healing)

```typescript
class AgentPoolManager {
  // Per-agent pool
  min_replicas: 2;
  max_replicas: 10;
  target_cpu_utilization: 70%;
  
  // Health management
  health_check_interval_ms: 10000;
  unhealthy_threshold: 3;        // Consecutive failures
  replacement_timeout_ms: 30000; // Max time to replace
  
  // Checkpointing
  checkpoint_interval_spans: 5;  // Persist Merkle every N spans
  resume_from_checkpoint: true;
}
```

**Behavior**:
1. Kubernetes HPA scales on CPU/memory/custom metrics
2. `AgentPoolManager` watches `/health` endpoints
3. Unhealthy pod → drain → terminate → new pod → warm-up → ready
4. In-flight requests → Merkle checkpoint → resume on replacement

### 3.3 Merkle Checkpointing (State Recovery)

```typescript
interface MerkleCheckpoint {
  trace_id: string;
  span_id: string;
  agent_id: AgentId;
  step_index: number;
  input_hash: string;          // SHA256 of input
  output_hash: string;         // SHA256 of output (if complete)
  execution_tier: string;
  model_hash: string;
  timestamp: string;
  merkle_proof: string;        // Chain integrity
}
```

**Every 5 spans** → persisted to `AuditLedger` + `ZDRStore`  
**On agent replacement** → new instance reads latest checkpoint → resumes.

### 3.4 Synthetic Canaries (Layer 4: Observability)

| Canary | Frequency | Success Criteria | Alert Threshold |
|--------|-----------|------------------|-----------------|
| **Agent Liveness** | 30s | `/health` = HEALTHY | 3 consecutive failures |
| **End-to-End Screening** | 60s | Agent-4 returns `decision` in <10s | P99 > 15s or error rate > 1% |
| **LLM Tier Failover** | 5min | CLOUD→LOCAL→HEURISTIC completes | Any tier unavailable > 2min |
| **Audit Chain Integrity** | 5min | Merkle verification passes | Any verification failure |
| **ZDR Store** | 30s | Read/write <50ms | P99 > 100ms |

**Error Budget**: 99% uptime = 43 min/month downtime budget  
**Burn Rate Alert**: >2% budget/hour → page on-call

---

## 4. Knowledge Base Integration

### 4.1 Nexus Knowledge Base (Shared Context)

All agents access **structured knowledge** via `KnowledgeService`:

```typescript
interface KnowledgeService {
  // Product/Substance
  resolveProduct(query: string): Promise<ProductMatch[]>;
  getSubstanceSynonyms(substance: string): Promise<string[]>;
  
  // Regulatory
  getListednessRules(region: string): Promise<ListednessRule[]>;
  getSeriousnessCriteria(region: string): Promise<SeriousnessCriterion[]>;
  
  // Medical
  getMedDRAHierarchy(llt: string): Promise<MedDRAHierarchy>;
  getClinicalGuidelines(drugClass: string): Promise<ClinicalGuideline[]>;
  
  // Operational
  getScreeningCriteria(): Promise<ScreeningCriterion[]>;
  getInclusionExclusionRules(): Promise<InclusionExclusionRule[]>;
}
```

### 4.2 Knowledge Injection Pattern

```typescript
// In agent.execute()
const knowledge = await this.knowledgeService.getScreeningCriteria();
// Inject into prompt/context
const enrichedPrompt = this.buildPrompt(input.payload, knowledge);
// Execute with enriched context
```

**No hardcoded medical/regulatory knowledge in agents.** All externalized.

---

## 5. Agent Registry (Current + Planned)

### 5.1 Core Phase 2 Agents (lib/agents/) — **IMPLEMENTED ✅**

| ID | Agent | Tier Support | Latency Budget | Status |
|----|-------|--------------|----------------|--------|
| 1 | `agent-1-literature-duplicates` | LOCAL, HEURISTIC | 5s | ✅ Done |
| 2 | `agent-2-icsr-duplicates` | LOCAL, HEURISTIC | 8s | ✅ Done |
| 3 | `agent-3-followup-generator` | LOCAL, HEURISTIC | 2s | ✅ Done |
| 4 | `agent-4-screening` | CLOUD, LOCAL, HEURISTIC, DLQ | 10s | ✅ Done |
| 5 | `agent-5-action-taken` | LOCAL, HEURISTIC | 1.5s | ✅ Done |
| 6 | `agent-6-dechallenge` | LOCAL, HEURISTIC | 1.5s | ✅ Done |
| 7 | `agent-7-rechallenge` | LOCAL, HEURISTIC | 1.5s | ✅ Done |
| 8 | `agent-8-medical-history` | LOCAL, HEURISTIC | 5s | ✅ Done |

### 5.2 Canonical AG Agents → Migrate to lib/agents (Week 1-4)

| AG | Target lib/agent | Source | Effort |
|----|------------------|--------|--------|
| AG02 | Merge → agent-4 (screening) | `AG02/src/canonical/backend/agents/event_runtime/` | 3 days |
| AG13 | **agent-9-causality** | `AG13/src/backend/` | 5 days |
| AG11 | Merge → agent-4 + agent-10 | `AG11/src/backend/` | 3 days |
| AG05 | Merge → agent-5 (action-taken) | `AG05/src/canonical/` | 2 days |
| AG12 | **agent-10-listedness** | `AG12/src/canonical/` | 3 days |
| AG08 | **agent-11-country-incident** | `AG08/src/canonical/` | 2 days |
| AG10 | Enhance `nllb-translator.ts` | `AG10/src/canonical/` | 2 days |
| AG17 | **agent-12-safety-detection** | `AG17/src/canonical/` | 3 days |
| AG20 | **agent-13-narrative-gen** | `AG20/src/canonical/` | 3 days |
| AG26 | **agent-14-intake-triage** | `AG26/src/canonical/` | 3 days |

### 5.3 Legacy AG Agents → Migrate (Week 5-8)

| AG | Target | Source | Notes |
|----|--------|--------|-------|
| AG01 | **agent-15-drug-extraction** | `AG01/src/backend/` | Pre-screening |
| AG03 | Merge → agent-8 | `AG03/src/v2_5/` | Patient ID |
| AG04 | **agent-16-reporter-id** | `AG04/src/v2_5/` | Reporter ID |
| AG06/24 | Merge → agent-8 | `AG06/src/kimi8/`, `AG24/src/v2_5/` | Med History |
| AG09 | **agent-17-clock-start** | `AG09/src/v2_5/` | 7d/15d clock |
| AG14 | Merge → agent-6 | `AG14/src/kimi8/` | Dechallenge |
| AG15 | Merge → agent-7 | `AG15/src/kimi8/` | Rechallenge |
| AG18 | **DEPRECATE** → agent-1 | `AG18/src/kimi8/` | Duplicate |
| AG19 | **DEPRECATE** → agent-2 | `AG19/src/kimi8/` | Duplicate |
| AG21 | **DEPRECATE** → agent-3 | `AG21/src/kimi8/` | Duplicate |
| AG22 | Merge → agent-4 | `AG22/src/kimi8/` | Inclusion/Exclusion |
| AG23 | **DEPRECATE** → agent-5 | `AG23/src/kimi8/` | Duplicate |

### 5.4 Missing Agents → Build New (Week 9-12)

| AG | Target lib/agent | Purpose |
|----|------------------|---------|
| AG07 | **agent-18-lab-data** | Laboratory data extraction |
| AG16 | **agent-19-aesi-detection** | AESI/Special situations |
| AG25 | **agent-20-icsr-validity** | ICSR validity checking |
| AG27 | **agent-21-patient-aggregate** | Patient aggregate relevance |

---

## 6. Weekly Release Cadence (Starting November)

### Sprint Structure (2-week sprints, 1 module release/week)

| Week | Module | Agents Delivered | Milestone |
|------|--------|------------------|-----------|
| **Nov W1** | **Literature Screening** | agent-1, agent-4, agent-9 (causality), AG10, AG17, AG08 | **Dogfood ready** |
| **Nov W2** | **Intake & Triage** | agent-14 (AG26), agent-15 (AG01), agent-16 (AG04), agent-17 (AG09) | **Intake pipeline** |
| **Nov W3** | **Case Processing Core** | agent-2, agent-3, agent-5, agent-6, agent-7, agent-8, agent-9, agent-10, agent-11, agent-12 | **Case workflow** |
| **Nov W4** | **Submissions** | agent-13 (AG20), E2B XML, Gateway adapters | **Submission ready** |
| **Dec W1** | **Resilience Platform** | AgentPoolManager, Multi-provider Router, Checkpointing, Canaries | **99% infra** |
| **Dec W2** | **Eval Harness** | Golden sets, Code metrics, LLM judges, Regression CI | **Layer 3 done** |
| **Dec W3** | **Legacy Migration** | AG01, AG03, AG04, AG06, AG09, AG14, AG15, AG22 | **Consolidation** |
| **Dec W4** | **Missing Agents** | AG07, AG16, AG25, AG27 | **Complete** |

### Release Gates (Every Week)

| Gate | Criteria |
|------|----------|
| **Code** | `npm run typecheck:lib` = 0 errors |
| **Tests** | E2E + Unit ≥ 90% coverage, all pass |
| **Eval** | Golden set accuracy ≥ 95% (or documented gap) |
| **Audit** | Merkle chain verified, 21 CFR Part 11 checklist pass |
| **Performance** | P99 latency within budget, error rate < 0.5% |
| **Security** | SAST/DAST scan pass, secrets scan clean |
| **Docs** | Agent spec updated, runbook updated, API docs current |

---

## 7. Open Source Leverage (Reduce Build Time)

| Need | Tool | Integration |
|------|------|-------------|
| **Agent Orchestration** | **Temporal.io** or **Hatchet** | Replace custom message passing with durable execution |
| **LLM Router** | **LiteLLM** (proxy) | Multi-provider, fallbacks, caching, budgets |
| **Vector Search** | **Qdrant** or **Weaviate** | Replace custom product gate if needed |
| **Eval Framework** | **LangSmith** or **Braintrust** | Golden sets, LLM judges, regression detection |
| **Observability** | **OpenTelemetry** + **Grafana** | Standardize telemetry, dashboards, alerts |
| **Workflow Engine** | **Temporal** | Saga pattern, checkpointing, retries built-in |
| **K8s Operator** | **KubeBuilder** | AgentPoolManager as CRD controller |

**Recommendation**: Adopt **Temporal + LiteLLM + LangSmith** this sprint. Saves 4-6 weeks of custom infrastructure.

---

## 8. Implementation Checklist (Per Agent)

Before any agent merges to `main`:

- [ ] Extends `BaseAgent` with correct `AgentId`
- [ ] Implements `execute()` + `getCapabilities()`
- [ ] Factory function `create<Name>Agent()`
- [ ] Input/output schemas validate (Zod)
- [ ] `/health` endpoint returns `AgentHealth`
- [ ] Merkle audit recorded on every execution
- [ ] Tier fallback tested (CLOUD→LOCAL→HEURISTIC→DLQ)
- [ ] Golden test set (≥20 cases) in `evals/golden/<agent-id>.json`
- [ ] Code-based evals pass (schema, tool selection, latency)
- [ ] LLM judge evals pass (groundedness, correctness, tone)
- [ ] Load tested at 2x expected throughput
- [ ] Chaos tested (kill agent, kill LLM, kill Redis)
- [ ] Documentation: spec, runbook, API, troubleshooting
- [ ] Security: no secrets, input validation, blast radius documented

---

## 9. Governance

| Role | Responsibility |
|------|----------------|
| **CTO** | Framework ownership, release approval, architecture decisions |
| **Tech Lead (Agents)** | Agent implementation quality, code review, migration |
| **Tech Lead (Platform)** | AgentPoolManager, Router, Infra, Canaries |
| **QA/Eval Lead** | Golden sets, eval harness, regression detection |
| **Compliance** | 21 CFR Part 11, GVP, audit trail verification |
| **On-Call** | Canary alerts, error budget burns, incident response |

**Weekly Sync**: Monday 9am — Review prior week metrics, approve next release, unblock.

---

## 10. Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| CTO | | | |
| Tech Lead (Agents) | | | |
| Tech Lead (Platform) | | | |
| Compliance | | | |

---

**This framework is the single source of truth. All agents, all modules, all releases conform. No exceptions.**