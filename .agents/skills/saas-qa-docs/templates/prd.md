# PRD: [Product/Feature Name]

## Executive Summary
One paragraph: what, why, who, when.

## Market & Business Context
- **Target market**: [pharma CROs, safety teams, regulatory affairs]
- **Business model**: [SaaS subscription, per-user, per-volume]
- **Competitive landscape**: [key competitors, our differentiation]
- **Revenue impact**: [ARR projection, upsell path]

## Regulatory & Compliance (CRITICAL for Life Sciences)
| Regulation | Applicability | Evidence Required |
|------------|---------------|-------------------|
| 21 CFR Part 11 | Electronic records/signatures | Audit trail, e-sig, validation |
| EU Annex 11 | Computerised systems | Validation, audit trail, access control |
| GDPR / HIPAA | Personal health data | DPIA, BAA, encryption, consent |
| ICH E2B(R3) | Safety reporting | XML format, transmission, acknowledgment |
| ISO 14155 / GCP | Clinical data | Data integrity, traceability |
| ISO 27001 / SOC 2 | Security | Controls, penetration test, audit |

## Product Requirements

### Core Features (Must Have)
| ID | Feature | Description | Regulatory Ref |
|----|---------|-------------|----------------|
| PRD-001 | Literature ingestion | PubMed, Embase, custom sources | 21 CFR 11.10 |
| PRD-002 | AI screening | Title/abstract + full-text classification | Validation protocol |
| PRD-003 | Data extraction | Drug, AE, patient, study data | ICH E2B |
| PRD-004 | Medical coding | MedDRA, WHODrug, ICD mapping | MedDRA license |
| PRD-005 | Case creation | ICSR generation, review workflow | 21 CFR 11.50 |
| PRD-006 | Regulatory submission | E2B(R3) XML, gateway integration | FDA/EMA gateway |
| PRD-007 | Audit trail | Immutable, tamper-evident | 21 CFR 11.10 |
| PRD-008 | User management | Roles, 2FA, session control | 21 CFR 11.100 |

### Quality Features (Should Have)
| ID | Feature | Description |
|----|---------|-------------|
| PRD-009 | Duplicate detection | Cross-source, cross-language |
| PRD-010 | Signal detection | Disproportionality analysis |
| PRD-011 | Periodic reporting | PSUR/PBRER automation |
| PRD-012 | Quality metrics | Precision/recall dashboards |

### Differentiators (Nice to Have)
| ID | Feature | Description |
|----|---------|-------------|
| PRD-013 | Multi-language screening | Non-English literature |
| PRD-014 | Real-world evidence | EHR, claims linkage |
| PRD-015 | AI explainability | Attention maps, citations |

## User Roles & Permissions Matrix

| Role | Screen | Extract | Code | Review | Approve | Submit | Admin |
|------|--------|---------|------|--------|---------|--------|-------|
| Safety Scientist | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Senior Reviewer | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| QA Auditor | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Regulatory Affairs | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| System Admin | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

## Data Lifecycle
| Stage | Retention | Archival | Deletion |
|-------|-----------|----------|----------|
| Raw literature | 7 years | Cold storage | Never (regulatory) |
| Screened records | 10 years | Cold storage | Never |
| Extracted data | 15 years | Cold storage | Never |
| ICSR cases | 25 years | Cold storage | Never |
| Audit logs | Permanent | Hot storage | Never |

## Success Metrics (KPIs)
| Metric | Target | Measurement |
|--------|--------|-------------|
| Screening recall | >99.5% | Gold standard comparison |
| Screening precision | >85% | Reviewer confirmation |
| Extraction accuracy | >95% | Manual QC sample |
| Coding accuracy | >98% | MedDRA/WHODrug match |
| Time-to-case | <4 hours | Workflow timestamps |
| Submission success | 100% | Gateway acknowledgments |
| System uptime | 99.9% | SLA monitoring |