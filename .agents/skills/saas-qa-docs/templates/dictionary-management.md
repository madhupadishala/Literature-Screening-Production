# Nexus Dictionary Management Guide

## 1. Introduction
- **Purpose**: Govern dictionary lifecycle, versioning, and coding compliance
- **Audience**: Dictionary Administrators, Safety Scientists, Coders, QA, Regulatory Affairs
- **Scope**: MedDRA, WHODrug, ICD-10/11, Custom dictionaries

## 2. Dictionary Inventory

| Dictionary | Authority | Version Cycle | License Type | Nexus Integration |
|------------|-----------|---------------|--------------|-------------------|
| **MedDRA** | MSSO (Maintenance and Support Services Organization) | Bi-annual (Mar/Sep) | Subscription (per user) | Native, versioned |
| **WHODrug Global** | UMC (Uppsala Monitoring Centre) | Quarterly (B1/B2/B3) | Subscription | Native, versioned |
| **WHODrug Enhanced** | UMC | Quarterly (C1/C2/C3) | Subscription | Native, versioned |
| **ICD-10-CM/PCS** | CMS/NCHS (US) / WHO (Intl) | Annual (Oct) | Free (US) / License (Intl) | Native, versioned |
| **ICD-11** | WHO | Continuous | Free | Native, versioned |
| **Custom** | Internal | As needed | Internal | Configurable |

## 3. Version Management

### 3.1 Versioning Policy
| Aspect | Policy |
|--------|--------|
| **Active Version** | Used for all new coding |
| **Previous Version** | Read-only for 90 days (re-coding support) |
| **Archived Versions** | Cold storage, accessible for audit |
| **Coexistence Period** | 90 days dual-coding window |
| **Force Upgrade** | After 90 days, previous version locked |

### 3.2 Version Metadata (Stored per Version)
```yaml
dictionary: "MedDRA"
version: "26.0"
release_date: "2026-03-01"
effective_date: "2026-09-01"
license_expiry: "2027-08-31"
checksum: "sha256:..."
source_url: "https://mss.o.meddra.org/downloads/..."
changelog: |
  - 1,247 new LLTs
  - 89 hierarchy changes (PT→HLT moves)
  - 23 retired codes (SMQ impact)
  - 15 new SMQs
impact_assessment: "HIGH - SMQ changes affect signal detection"
```

## 4. Upgrade Procedure

### 4.1 Pre-Upgrade Checklist
- [ ] **License verified** for new version
- [ ] **Distribution files** received and checksummed
- [ ] **Impact assessment** completed (coding, SMQs, rules, reports)
- [ ] **Staging environment** prepared
- [ ] **Downtime window** scheduled (2-4 hours)
- [ ] **Rollback plan** documented and tested
- [ ] **Communication** sent to all users (2 weeks notice)
- [ ] **Training materials** updated

### 4.2 Upgrade Steps
```
PHASE 1: STAGING (Day -7 to Day -1)
1. Load new version in staging
2. Run automated regression:
   - Coding API tests (1000 sample terms)
   - SMQ mapping validation
   - Report comparison (old vs new)
   - Integration tests (submissions, signals)
3. User acceptance testing (5 coders, 2 hours each)
4. Performance benchmark (coding latency)
5. Sign-off: QA + Safety Lead + IT

PHASE 2: PRODUCTION (Day 0)
1. Maintenance mode enabled (read-only)
2. Backup current dictionary (DB + files)
3. Load new version
4. Re-index coding cache
5. Validate: sample coding (50 terms)
6. Disable maintenance mode
7. Monitor: error rate, latency, user feedback (2 hours)

PHASE 3: POST-UPGRADE (Day 0 to Day +90)
1. Dual-coding period (both versions available)
2. Daily coding QC (10% sample)
3. Weekly SMQ impact review
4. User feedback collection
90-DAY MARK:
5. Lock previous version (read-only)
6. Archive previous version
7. Final sign-off
```

### 4.3 Rollback Procedure
```
TRIGGER: Critical error rate >1%, coding failures, submission rejections
TIME TARGET: <30 minutes

STEPS:
1. Enable maintenance mode
2. Restore previous version from backup
3. Re-index coding cache
4. Validate: sample coding (20 terms)
4. Disable maintenance mode
5. Notify users: "Temporary revert, investigation ongoing"
6. Root cause analysis within 24 hours
```

## 5. Coding Governance

### 5.1 Coding Rules by Dictionary
| Rule | MedDRA | WHODrug | ICD-10 |
|------|--------|---------|--------|
| **Hierarchy Enforcement** | LLT → PT → HLT → HLGT → SOC | Drug → Ingredient → ATC | Code → Category → Block |
| **Dual-Coding Required** | Serious AEs (configurable) | High-risk drugs | Never |
| **Auto-Suggest** | Top 3 LLTs + PT | Top 3 Drug Codes | Top 3 Codes |
| **Retired Code Handling** | Warning + block submit | Warning + block submit | Warning only |
| **Version Lock** | Prevent coding on retired | Prevent coding on retired | Annual lock |

### 5.2 Coding Quality Control
| QC Activity | Frequency | Sample | Performed By |
|-------------|-----------|--------|--------------|
| **Blind Re-coding** | Weekly | 10% of cases | Senior Coder |
| **Dual-Coding Discrepancy** | Per case | 100% serious AEs | System + Senior |
| **SMQ Impact Review** | Per version | All affected | Signal Team |
| **Coding Accuracy Audit** | Monthly | 50 cases | QA |
| **Inter-Rater Reliability** | Quarterly | 20 cases × 3 coders | QA |

### 5.3 Coding Accuracy Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| **MedDRA LLT Accuracy** | >98% | Blind re-code match |
| **MedDRA PT Accuracy** | >99.5% | Blind re-code match |
| **WHODrug Accuracy** | >98% | Blind re-code match |
| **Dual-Coding Agreement** | >95% | Cohen's Kappa >0.9 |
| **SMQ Mapping Accuracy** | 100% | Automated validation |

## 6. Dictionary-Specific Procedures

### 6.1 MedDRA (MSSO)
| Activity | Details |
|----------|---------|
| **Distribution** | MSSO Portal → Encrypted ASCII/XML |
| **Subscription** | Annual renewal, per named user |
| **Browser Access** | MSSO Browser (web) for reference |
| **SMQs** | Downloaded with MedDRA, versioned |
| **MSSO Updates** | Interim corrections (rare) - apply within 30 days |

### 6.2 WHODrug (UMC)
| Activity | Details |
|----------|---------|
| **Distribution** | UMC Portal → Encrypted SDF/XML |
| **Subscription** | Annual, per concurrent user |
| **Global vs Enhanced** | Enhanced includes trade names, ATC |
| **UMC Updates** | Quarterly, apply within 60 days |

### 6.3 ICD-10/11
| Activity | Details |
|----------|---------|
| **ICD-10-CM/PCS** | CMS website (US) - free download |
| **ICD-10 (Intl)** | WHO - license required |
| **ICD-11** | WHO API / Browser - continuous updates |
| **Mapping** | ICD-10 ↔ ICD-11 mapping tables maintained |

## 7. Custom Dictionaries

### 7.1 Use Cases
- Company-specific drug codes (legacy)
- Internal project codes
- Regional extensions (e.g., JP MASTER, CN NMPA)
- Study-specific terminology

### 7.2 Structure
```yaml
dictionary: "COMPANY_DRUG_CODES"
version: "2026.01"
format: "CSV"
fields:
  - code: "string (primary key)"
  - name: "string"
  - ingredient: "string"
  - atc_code: "string"
  - whodrug_mapping: "string (optional)"
  - status: "active/retired"
  - effective_date: "date"
  - retirement_date: "date (optional)"
governance:
  owner: "Pharmacovigilance IT"
  steward: "Senior Coder"
  review_cycle: "Quarterly"
```

## 8. Reporting & Analytics

### 8.1 Dictionary Usage Reports
| Report | Frequency | Audience |
|--------|-----------|----------|
| **Coding Volume by Dictionary** | Monthly | Management |
| **Code Distribution (PT/SOC)** | Monthly | Signal Team |
| **Retired Code Usage** | Weekly (during transition) | Coders |
| **Dual-Coding Discrepancies** | Weekly | QA |
| **Version Adoption** | Daily (during upgrade) | All |

### 8.2 Regulatory Reporting
| Report | Dictionary | Requirement |
|--------|------------|-------------|
| **E2B(R3) Submission** | MedDRA (LLT/PT), WHODrug | Current version at submission |
| **PSUR/PBRER** | MedDRA (PT/SOC), WHODrug | Version stated in report |
| **Signal Detection** | MedDRA (SMQ) | Version stated in analysis |
| **Regulatory Audit** | All | Version history, change log |

## 9. Integration Points

| System | Dictionary | Integration |
|--------|------------|-------------|
| **Nexus Coding Module** | All | Native, versioned |
| **Signal Detection (Empirica)** | MedDRA SMQ | API / File export |
| **Regulatory Gateway** | MedDRA, WHODrug | E2B(R3) XML |
| **Clinical Systems (EDC)** | MedDRA, WHODrug | ODM / API sync |
| **BI/Analytics** | All | Data warehouse sync |

## 10. Compliance & Audit

### 10.1 Audit Trail Requirements
- Every dictionary load: user, timestamp, version, checksum
- Every coding action: dictionary version used
- Every version change: approval, testing evidence
- Retention: 25 years (aligned with case retention)

### 10.2 License Compliance
| Dictionary | License Check | Frequency |
|------------|---------------|-----------|
| MedDRA | Named users ≤ licensed | Monthly |
| WHODrug | Concurrent users ≤ licensed | Monthly |
| ICD-10 | N/A (free) | N/A |

### 10.3 Regulatory References
- **21 CFR Part 11**: Dictionary as validated reference data
- **ICH E2B(R3)**: MedDRA/WHODrug required for submissions
- **FDA Guidance**: "Use current MedDRA version"
- **EMA Guidance**: "MedDRA version stated in PSUR"
- **PMDA**: Japanese MedDRA (JMO) alignment

## 11. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| **Code not found** | Version mismatch / retired code | Verify active version, check retired list |
| **SMQ not matching** | SMQ version outdated | Reload SMQ with MedDRA version |
| **WHODrug mapping fails** | Drug name variation | Use fuzzy match, check trade names |
| **ICD-10 code invalid** | Annual update missed | Load current version |
| **Dual-coding discrepancy** | Different versions used | Enforce version lock |
| **Submission rejected** | Dictionary version not accepted | Verify gateway requirements |

## 12. Appendices
- A: MedDRA Hierarchy Diagram
- B: WHODrug Structure (Drug Code, Record Type)
- C: ICD-10/11 Mapping Tables
- D: SMQ List with Version Tracking
- E: License Inventory
- F: Upgrade Runbooks (per dictionary)
- G: Coding Quick Reference Cards