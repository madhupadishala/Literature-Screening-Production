# Validation Protocol: [System/Feature Name]

## 1. Purpose & Scope
- **System**: [Name, version, environment]
- **Regulatory basis**: 21 CFR Part 11, EU Annex 11, GAMP 5
- **Validation approach**: Risk-based (GAMP 5 Category [1-5])
- **In scope**: [modules, interfaces, data flows]
- **Out of scope**: [explicit exclusions]

## 2. Roles & Responsibilities
| Role | Responsibility |
|------|----------------|
| Validation Lead | Protocol execution, deviation management |
| QA | Review/approve protocol, witness testing |
| Development | Provide test scripts, fix defects |
| Business User | UAT execution, sign-off |
| IT/Infra | Environment, backup, restore |

## 3. Risk Assessment (GAMP 5)
| Function | Risk (H/M/L) | Impact | Mitigation | Test Priority |
|----------|--------------|--------|------------|---------------|
| Literature ingestion | High | Missed safety signals | Automated QC, duplicate checks | Critical |
| AI classification | High | False negatives | Human-in-loop, confidence thresholds | Critical |
| Data extraction | High | Incomplete ICSR | Validation rules, reviewer QC | Critical |
| Medical coding | High | Wrong MedDRA code | Dual coding, dictionary version control | Critical |
| Case submission | High | Regulatory rejection | Gateway validation, test submissions | Critical |
| Audit trail | High | Data integrity | Immutable logs, tamper detection | Critical |
| User access | Medium | Unauthorized access | RBAC, 2FA, session timeout | High |
| Reporting | Medium | Incorrect metrics | Automated reconciliation | High |

## 4. Qualification Strategy
| Phase | Description | Deliverable |
|-------|-------------|-------------|
| DQ | Design Qualification | Approved design specs, traceability |
| IQ | Installation Qualification | Environment config, versions, certificates |
| OQ | Operational Qualification | Test scripts, results, deviations |
| PQ | Performance Qualification | UAT scripts, production data subset, sign-off |

## 5. Test Cases (Minimum Set)

### 5.1 21 CFR Part 11 Compliance
| TC-ID | Requirement | Test Description | Expected Result |
|-------|-------------|------------------|-----------------|
| CFR-001 | 11.10(a) | System validates data integrity | Invalid data rejected with audit entry |
| CFR-002 | 11.10(b) | System generates audit trail | All create/read/update/delete logged |
| CFR-003 | 11.10(c) | Audit trail immutable | Cannot modify/delete audit records |
| CFR-004 | 11.10(d) | Audit trail includes user, time, action | All fields populated correctly |
| CFR-005 | 11.10(e) | Audit trail retained for retention period | Records accessible for 25+ years |
| CFR-006 | 11.10(f) | Operational system checks | Sequence checks, authority checks |
| CFR-007 | 11.10(g) | Authority checks | Users only perform authorized actions |
| CFR-008 | 11.10(h) | Device checks | Input devices validated |
| CFR-009 | 11.10(i) | Training documentation | Users trained per role |
| CFR-010 | 11.10(j) | Policies & procedures | SOPs documented and followed |
| CFR-011 | 11.30 | Electronic signatures unique | One user = one e-sig |
| CFR-012 | 11.50 | Signature components | Printed name, date, time, meaning |
| CFR-013 | 11.70 | Signature linking | Signature bound to record |
| CFR-014 | 11.100 | Controls for identification codes | Password policies, token management |

### 5.2 Functional Test Cases
| TC-ID | Feature | Test Scenario | Pass Criteria |
|-------|---------|---------------|---------------|
| FUNC-001 | Literature import | Import PubMed XML, verify record count | Count matches source ±0 |
| FUNC-002 | AI screening | Run classifier on gold set | Recall >99.5%, Precision >85% |
| FUNC-003 | Data extraction | Extract drug/AE from known article | All entities found, correct spans |
| FUNC-004 | MedDRA coding | Code "nausea" → MedDRA LLT | Returns 10027753 (Nausea) |
| FUNC-005 | Case creation | Build ICSR from extracted data | Valid E2B(R3) XML generated |
| FUNC-006 | Submission | Submit to test gateway | Acknowledgment received |

### 5.3 Performance & Security
| TC-ID | Category | Test | Pass Criteria |
|-------|----------|------|---------------|
| PERF-001 | Load | 1000 concurrent screenings | p95 < 5s, 0 errors |
| PERF-002 | Volume | 100k articles/day | Completes in <8 hours |
| SEC-001 | Penetration | OWASP Top 10 scan | No Critical/High findings |
| SEC-002 | Data encryption | Verify TLS 1.3, AES-256 at rest | All connections encrypted |

## 6. Acceptance Criteria
- All Critical/High test cases: **Pass**
- No open Critical/High deviations
- Traceability matrix: 100% coverage (URS→Test)
- QA sign-off obtained

## 7. Deviation Management
| Deviation ID | Description | Impact | Disposition | Status |
|--------------|-------------|--------|-------------|--------|

## 8. Sign-Off
| Role | Name | Signature | Date |
|------|------|-----------|------|
| Validation Lead | | | |
| QA Manager | | | |
| Business Owner | | | |
| IT Director | | | |