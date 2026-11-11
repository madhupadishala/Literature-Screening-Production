---
name: saas-qa-docs
description: >
  QA & documentation skill for SaaS product building. Generates and maintains
  URS (User Requirements), FRS (Functional Requirements), TRS (Technical Requirements),
  test plans, traceability matrices, and release documentation at each development step.
  Follows lazy senior dev principles: minimum docs that fully serve the purpose.
license: MIT
metadata:
  version: "1.0.0"
---

# SaaS QA & Documentation Skill

**Purpose**: One skill that creates and maintains all product documentation a SaaS needs — from requirements through release — without boilerplate bloat.

## Documents This Skill Produces

### Core SaaS (All Products)
| Doc | When | Purpose |
|-----|------|---------|
| **URS** (User Requirements Spec) | Discovery / Kickoff | What users need, in their language |
| **FRS** (Functional Requirements Spec) | Design phase | What the system must do, testable |
| **TRS** (Technical Requirements Spec) | Architecture | How it's built: APIs, data, infra, security |
| **Test Plan** | Pre-dev / Sprint 0 | Scope, strategy, environments, exit criteria |
| **Traceability Matrix** | Ongoing | URS → FRS → TRS → Tests → Defects |
| **Release Notes** | Each release | What changed, known issues, upgrade path |
| **API Contract** | API design | OpenAPI spec + consumer-driven contracts |
| **Runbook** | Pre-prod | Deploy, rollback, alerts, on-call |

### Life Sciences / Healthcare SaaS (Regulated)
| Doc | When | Purpose |
|-----|------|---------|
| **PRD** (Product Requirements Doc) | Pre-dev | Market, compliance, business case |
| **Validation Master Plan** | Pre-release | GAMP 5, 21 CFR 11, EU Annex 11 master plan |
| **Validation Protocol** (IQ/OQ/PQ) | Pre-release | 21 CFR Part 11, GAMP 5, EU Annex 11 |
| **DPIA** (Data Protection Impact Assessment) | Design | GDPR, HIPAA, cross-border transfers |
| **SOP** (Standard Operating Procedure) | Ongoing | GxP processes, training, deviation handling |
| **CAPA** (Corrective/Preventive Action) | Post-incident | Root cause, effectiveness checks |
| **Vendor Assessment** | Procurement | Critical vendor qualification, quality agreements |
| **Change Control** | Any change | Impact assessment, regulatory consideration |
| **Audit Trail Spec** | Architecture | 21 CFR 11.10, ALCOA+, tamper-evidence |
| **Dictionary Management** | Ongoing | MedDRA/WHODrug/ICD lifecycle, coding governance |
| **Integration Guide** | Per integration | E2B, EDC, CTMS, Clinical systems, Literature |

### Admin/Operations Documentation
| Doc | When | Purpose |
|-----|------|---------|
| **Safety Administrator Guide** | Release | User mgmt, sources, rules, dictionaries, reporting |
| **Service Administrator Guide** | Release | Infra, K8s, CI/CD, Monitoring, Security, DR |
| **Integration Guide (Interchange)** | Per integration | E2B Gateway, EDC, CTMS, Literature, Dictionaries |

### User Documentation
| Doc | When | Purpose |
|-----|------|---------|
| **Module User Guide** | Per feature | End-user workflows, UI reference, FAQs |
| **Platform User Guide (Nexus)** | Release | Complete end-user manual for Nexus |

## Lazy Principles (Ponytail-aligned)

1. **One source of truth** — docs live in `/docs` as Markdown, versioned with code
2. **Generate, don't hand-write** — Use templates + scripts; hand-write only decisions
3. **Testable requirements** — Every FRS item maps to a test case; untestable = not a requirement
4. **Living documents** — Update in same PR as the code change; stale docs are worse than none
5. **Minimum viable docs** — Skip sections nobody reads (revision history, approval tables, glossary)

## Quick Commands (invoke in Claude)

### Core SaaS
```
/skill saas-qa-docs init              # Scaffold /docs with templates
/skill saas-qa-docs urs "feature"     # Draft URS for a feature
/skill saas-qa-docs frs "feature"     # Draft FRS from URS
/skill saas-qa-docs trs "feature"     # Draft TRS from FRS
/skill saas-qa-docs test-plan         # Generate test plan template
/skill saas-qa-docs trace             # Update traceability matrix
/skill saas-qa-docs release "v1.2.0"  # Draft release notes from git log
/skill saas-qa-docs audit             # Check doc coverage & staleness
```

### Regulated / Life Sciences
```
/skill saas-qa-docs prd "product"           # Draft Product Requirements Doc
/skill saas-qa-docs validation "feature"    # Draft Validation Protocol (IQ/OQ/PQ)
/skill saas-qa-docs dpia "feature"          # Draft Data Protection Impact Assessment
/skill saas-qa-docs sop "process-name"      # Draft Standard Operating Procedure
/skill saas-qa-docs capa "incident-id"      # Draft CAPA record
/skill saas-qa-docs vendor "vendor-name"    # Draft Vendor Assessment
/skill saas-qa-docs change "change-title"   # Draft Change Control record
/skill saas-qa-docs audit-trail "feature"   # Draft Audit Trail Specification
```

### User Documentation
```
/skill saas-qa-docs user-guide-module "module-name"   # Draft module user guide
/skill saas-qa-docs user-guide-nexus                  # Draft Nexus platform user guide
```

## Template Structure

```
/docs
├── templates/
│   ├── urs.md
│   ├── frs.md
│   ├── trs.md
│   ├── test-plan.md
│   ├── traceability.csv
│   ├── release-notes.md
│   ├── release-notes-enhanced.md
│   ├── runbook.md
│   ├── prd.md
│   ├── validation-protocol.md
│   ├── validation-master.md
│   ├── dpia.md
│   ├── sop.md
│   ├── capa.md
│   ├── vendor-assessment.md
│   ├── change-control.md
│   ├── audit-trail.md
│   ├── dictionary-management.md
│   ├── integration-guide.md
│   ├── admin-guide-safety.md
│   ├── admin-guide-service.md
│   ├── user-guide-module.md
│   └── user-guide-nexus.md
├── urs/
│   └── FEATURE-*.md
├── frs/
│   └── FEATURE-*.md
├── trs/
│   └── FEATURE-*.md
├── prd/
│   └── PRODUCT-*.md
├── validation/
│   └── FEATURE-*.md
├── validation-master/
│   └── VALIDATION-MASTER.md
├── dpia/
│   └── FEATURE-*.md
├── sop/
│   └── SOP-*.md
├── capa/
│   └── CAPA-*.md
├── vendors/
│   └── VENDOR-*.md
├── changes/
│   └── CR-*.md
├── audit-trails/
│   └── FEATURE-*.md
├── dictionaries/
│   └── DICT-*.md
├── integrations/
│   └── INT-*.md
├── admin-guides/
│   ├── safety-admin-*.md
│   └── service-admin-*.md
├── user-guides/
│   ├── MODULE-*.md
│   └── NEXUS-USER-GUIDE.md
├── test-plans/
│   └── SPRINT-*.md
├── traceability/
│   └── matrix.csv
├── releases/
│   └── v*.md
└── runbooks/
    └── *.md
```

## URS Template (minimum viable)

```markdown
# URS: [Feature Name]

## Problem Statement
> One paragraph: what user pain this solves.

## User Personas
- **Primary**: [role] — [goal]
- **Secondary**: [role] — [goal]

## User Stories (INVEST)
1. As a [persona], I want to [action], so that [benefit]
2. ...

## Acceptance Criteria (per story)
- Story 1: [Given/When/Then]
- Story 2: ...

## Out of Scope
- Explicitly not doing: [items]

## Success Metrics
- [Metric]: [target] (e.g., "Task completion rate: >90%")
```

## FRS Template (minimum viable)

```markdown
# FRS: [Feature Name]

## Functional Requirements
| ID | Requirement | Priority | URS Ref | Test Case |
|----|-------------|----------|---------|-----------|
| FR-001 | System shall... | Must | US-1 | TC-001 |

## Non-Functional Requirements
| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-001 | Performance | API p95 < 200ms | 200ms |
| NFR-002 | Security | OAuth 2.0 + PKCE | Standard |

## Data Requirements
- Entities: [list]
- Relationships: [ERD link]
- Retention: [policy]

## Integration Points
- Internal APIs: [list]
- External APIs: [list]
- Events: [publish/subscribe]
```

## TRS Template (minimum viable)

```markdown
# TRS: [Feature Name]

## Architecture Decision Record (ADR)
- **Decision**: [what we chose]
- **Alternatives considered**: [list]
- **Trade-offs**: [why this one]

## API Specification
- OpenAPI file: `openapi/feature.yaml`
- Auth: [method]
- Rate limits: [config]

## Database Schema
- Tables: [list with columns]
- Migrations: [files]
- Indexes: [performance-critical]

## Infrastructure
- Services: [list with replicas, resources]
- Queues: [topics, retention]
- Secrets: [Vault/Secrets Manager paths]

## Security
- Threat model: [link]
- Data classification: [PII, PHI, etc.]
- Compliance: [SOC2, HIPAA, etc.]

## Observability
- Metrics: [Prometheus queries]
- Logs: [structured fields]
- Traces: [span attributes]
- Alerts: [rules with runbook links]
```

## Traceability Matrix (CSV)

```csv
URS_ID,FRS_ID,TRS_ID,Test_ID,Status,Defect_ID
US-1,FR-001,TRS-API-01,TC-001,Pass,
US-1,FR-002,TRS-DB-01,TC-002,Fail,DEF-123
```

## Test Plan Template (minimum viable)

```markdown
# Test Plan: [Feature/Sprint]

## Scope
- In: [features]
- Out: [explicit exclusions]

## Strategy
- Unit: [coverage target %]
- Integration: [key flows]
- E2E: [critical paths]
- Contract: [consumer-driven]

## Environments
| Env | Purpose | Data | Reset |
|-----|---------|------|-------|
| dev | Integration | Synthetic | Daily |
| staging | E2E/Perf | Prod-like | Per sprint |
| prod | Canary | Real | N/A |

## Exit Criteria
- All Must-pass tests: Pass
- Critical/High defects: 0
- Performance benchmarks: Met
- Security scan: Clean
```

## Release Notes Template

```markdown
# Release v[version] - [date]

## Summary
One sentence: what this release delivers.

## New Features
- **FEAT-123**: [user-facing description] — [link to PR]

## Improvements
- **IMP-456**: [description]

## Bug Fixes
- **FIX-789**: [description] — [root cause if interesting]

## Breaking Changes
- **BREAK-001**: [what changes] — [migration guide link]

## Known Issues
- **ISSUE-111**: [description] — [workaround]

## Upgrade Guide
[Step-by-step if breaking changes]
```

## Runbook Template

```markdown
# Runbook: [Service/Feature]

## Architecture Overview
[1-paragraph + diagram link]

## Deploy
```bash
# Commands
```

## Rollback
```bash
# Commands (tested monthly)
```

## Key Alerts
| Alert | Severity | Runbook | Owner |
|-------|----------|---------|-------|
| HighErrorRate | Critical | [link] | [team] |

## Debugging
- Logs: [query]
- Metrics: [dashboard]
- Traces: [query]

## Contacts
- On-call: [schedule link]
- Escalation: [matrix]
```

## Usage in Your Workflow

### Sprint Start (Core SaaS)
```
/skill saas-qa-docs urs "user-invite-flow"
/skill saas-qa-docs frs "user-invite-flow"
/skill saas-qa-docs trs "user-invite-flow"
/skill saas-qa-docs test-plan
```

### During Sprint
```
/skill saas-qa-docs trace  # Update matrix after each PR
```

### Pre-Release (Core SaaS)
```
/skill saas-qa-docs release "v2.1.0"
/skill saas-qa-docs audit  # Check nothing slipped
```

### Regulated Feature Lifecycle (Life Sciences)
```
/skill saas-qa-docs prd "literature-screening"
/skill saas-qa-docs validation "ai-classification"
/skill saas-qa-docs dpia "patient-data-extraction"
/skill saas-qa-docs sop "case-review-workflow"
/skill saas-qa-docs change "meddra-version-upgrade"
/skill saas-qa-docs audit-trail "case-submission"
```

### Post-Incident
```
/skill saas-qa-docs capa "INC-2024-042"
```

### Vendor Onboarding
```
/skill saas-qa-docs vendor "meddra-licensing"
```

## Integration with Your Stack

- **Git hooks**: `pre-commit` runs `saas-qa-docs audit` on doc changes
- **CI**: Fails if traceability matrix has gaps
- **PR template**: Requires URS/FRS/TRS links for new features
- **Release automation**: `release` command reads git log + PR titles

## What This Skill Does NOT Do

- ❌ Write code
- ❌ Run tests
- ❌ Deploy
- ❌ Replace architectural thinking
- ❌ Generate boilerplate nobody reads

## License

MIT