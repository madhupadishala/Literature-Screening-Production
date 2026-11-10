# Phase 2 Architecture Design Document

## Overview
Phase 2 scales the Phase 1 single-pipeline screening into a full multi-agent orchestration system with 8 specialized PV agents, deterministic causality algorithms, HITL dashboard, and production telemetry.

## Agent Architecture (Agents 1-8)

| Agent ID | Name | Responsibility | Input | Output |
|----------|------|----------------|-------|--------|
| **Agent 1** | Literature Duplicates | Detect duplicate literature across PubMed, Embase, local DB | PMID, DOI, title, abstract | Duplicate clusters with similarity scores |
| **Agent 2** | ICSR Duplicates | Detect duplicate ICSR cases (E2B R3) | Case data, patient, drug, event | Duplicate groups with match confidence |
| **Agent 3** | Follow-up Generator | Generate follow-up requests for incomplete cases | Incomplete case, missing fields | Structured follow-up queries |
| **Agent 4** | Screening | Literature safety screening (Phase 1) | Article + product context | Screening decision + adverse events |
| **Agent 5** | Action Taken | Assess drug action taken (withdrawn, dose changed, etc.) | Case narrative, drug info | Action taken classification |
| **Agent 6** | Dechallenge | Assess dechallenge (improvement after drug stop) | Case timeline, drug stop date, event outcome | Dechallenge assessment (positive/negative/unassessable) |
| **Agent 7** | Rechallenge | Assess rechallenge (recurrence after restart) | Case timeline, restart date, recurrence | Rechallenge assessment |
| **Agent 8** | Medical History | Extract patient medical history from narrative | Case narrative, patient section | Structured medical history (MedDRA) |

## Communication Protocol

```
Message Envelope:
{
  "message_id": "uuid",
  "correlation_id": "uuid",          // Tracks end-to-end flow
  "source_agent": "agent_id",
  "target_agent": "agent_id",        // "broadcast" for fan-out
  "message_type": "request|response|event",
  "payload": { ... },
  "trace_context": {
    "trace_id": "uuid",
    "span_id": "uuid",
    "parent_span_id": "uuid"
  },
  "merkle_proof": "sha256_hash",      // For audit integrity
  "timestamp": "ISO8601"
}
```

## Deterministic Causality Algorithms

### Bradford Hill Criteria Implementation (Deterministic)

| Criterion | Algorithm | Output |
|-----------|-----------|--------|
| **Temporal Relationship** | Event onset after drug start? (within plausible window) | boolean + confidence |
| **Dechallenge** | Event improved after drug stop? (time-to-improvement) | positive/negative/unassessable |
| **Rechallenge** | Event recurred after restart? | positive/negative/unassessable |
| **Consistency** | Similar reports in literature/DB? | count + consistency score |
| **Specificity** | Event specific to drug class? | specificity score |
| **Biological Plausibility** | Mechanism known? (knowledge base lookup) | boolean + references |
| **Dose-Response** | Higher dose → higher risk? | trend analysis |
| **Coherence** | Consistent with known pharmacology? | boolean |

### State Machine for Case Processing

```
Case States:
INTAKE_RECEIVED → DUPLICATE_CHECK → SCREENING → 
  {INCLUDE} → CAUSALITY_ASSESSMENT → 
    DECHALLENGE → RECHALLENGE → ACTION_TAKEN → 
    MEDICAL_HISTORY → HUMAN_REVIEW_QUEUE → 
    APPROVED/REJECTED → INTAKE_EXPORT
  {EXCLUDE} → ARCHIVED
  {REVIEW} → HUMAN_REVIEW_QUEUE
```

## HITL Dashboard Service

### Review Queue Types
1. **Priority Queue** - Serious cases, regulatory deadlines (7d/15d)
2. **Standard Queue** - Routine screening decisions
3. **Escalation Queue** - Disagreements, low confidence
4. **Override Audit Queue** - All human overrides with e-signatures

### Electronic Signature (21 CFR Part 11)
```typescript
interface ElectronicSignature {
  reviewer_id: string;
  reviewer_role: string;
  signature_hash: string;           // HMAC-SHA256(content + timestamp + secret)
  signature_meaning: string;        // "Approved safety assessment"
  signed_at: ISO8601;
  content_hash: string;             // SHA-256 of reviewed content
  signature_algorithm: "HMAC-SHA256";
}
```

## Telemetry & Observability

### Metrics to Collect
| Metric | Type | Dimensions |
|--------|------|------------|
| `screener_tokens_per_second` | Gauge | model, tier, tenant |
| `agent_latency_ms` | Histogram | agent_id, operation, tier |
| `circuit_breaker_state` | Gauge | tier, agent_id |
| `merkle_chain_verification_duration_ms` | Histogram | tenant_id |
| `review_queue_depth` | Gauge | queue_type, priority |
| `human_review_override_rate` | Counter | reviewer_role, decision |
| `merkle_chain_integrity` | Gauge | tenant_id (0/1) |
| `agent_handoff_duration_ms` | Histogram | from_agent, to_agent |

### Health Checks
- `/health/live` - Process alive
- `/health/ready` - Dependencies ready (Redis, PostgreSQL, llama.cpp)
- `/health/deep` - Full dependency verification + Merkle chain sample verification

## Database Schema Extensions

### New Tables (Migration 044+)
1. `agent_executions` - All agent runs with Merkle proofs
2. `agent_messages` - Inter-agent communication log
3. `causality_assessments` - Bradford Hill criteria results
4. `human_review_queue` - HITL queue entries
5. `electronic_signatures` - 21 CFR Part 11 signatures
6. `telemetry_metrics` - Time-series metrics (partitioned by hour)
7. `circuit_breaker_events` - State change log

## Verification Strategy

### Test Matrix
| Test Case | Agents Involved | Verification |
|-----------|----------------|--------------|
| Literature duplicate detection | Agent 1 | Cluster accuracy > 95% |
| ICSR duplicate detection | Agent 2 | Match F1 > 0.9 |
| Dechallenge positive | Agent 6 | Correct temporal logic |
| Rechallenge positive | Agent 7 | Recurrence detection |
| Full causality chain | Agents 4-8 | Bradford Hill scoring |
| HITL override | Dashboard | E-sig + Merkle proof |
| Circuit breaker failover | Router | < 500ms MTTR |
| Concurrent load (50 cases) | All | p99 latency < 30s |

## Lockfile Extensions
- Additional model hashes for Agent-specific models
- Deterministic algorithm version pins
- Dashboard UI component versions