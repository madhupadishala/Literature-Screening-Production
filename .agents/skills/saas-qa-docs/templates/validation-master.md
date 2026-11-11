# Nexus Validation Master Plan

## 1. Purpose & Scope
- **System**: Nexus Pharmacovigilance Platform
- **Version**: [X.Y.Z]
- **Validation Approach**: GAMP 5 Risk-Based, 21 CFR Part 11, EU Annex 11
- **Categories in Scope**:
  - Category 3: Non-configured products (SaaS platform)
  - Category 4: Configured products (customer-specific rules)
  - Category 5: Custom applications (custom integrations)

## 2. Regulatory References
| Regulation | Scope | Key Requirements |
|------------|-------|------------------|
| **21 CFR Part 11** | Electronic records/signatures | Validation, audit trail, e-sig, access control |
| **EU Annex 11** | Computerised systems | Validation, audit trail, personnel, suppliers |
| **GAMP 5** | Risk-based validation | V-model, risk assessment, lifecycle |
| **ICH E2B(R3)** | Safety reporting | XML structure, gateway compliance |
| **ISO 14971** | Risk management | Hazard analysis, risk control |
| **ISO 27001** | Information security | Controls, risk treatment |

## 3. Validation Strategy

### 3.1 V-Model Mapping
```
User Requirements (URS)
    ↓
Functional Requirements (FRS)
    ↓
Technical Requirements (TRS) / Design Specification (DS)
    ↓
Code/Configure
    ↓
Installation Qualification (IQ)
    ↓
Operational Qualification (OQ)
    ↓
Performance Qualification (PQ)
    ↓
Release / Deploy
    ↓
Ongoing: Change Control, Periodic Review
```

### 3.2 Risk-Based Test Coverage
| GAMP Category | Risk Level | Test Coverage |
|---------------|------------|---------------|
| Category 3 (Platform) | High (safety-critical) | 100% Critical, 80% High, 50% Medium |
| Category 4 (Configuration) | Medium-High | 100% Critical, 60% High |
| Category 5 (Custom) | High | 100% Critical, 80% High |

## 4. Validation Deliverables

| Deliverable | Phase | Owner | Review/Approval |
|-------------|-------|-------|-----------------|
| Validation Master Plan (this doc) | Plan | Validation Lead | QA, Regulatory, IT |
| URS | Requirements | Product Owner | QA, Stakeholders |
| FRS | Requirements | Business Analyst | QA, Product, Tech Lead |
| TRS/DS | Design | Architect | QA, Security, Tech Lead |
| Traceability Matrix | All | Validation Engineer | QA |
| Risk Assessment (FMEA) | Design | QA + Product | QA, Regulatory |
| IQ Protocol/Report | IQ | DevOps | QA |
| OQ Protocol/Report | OQ | QA + Dev | QA |
| PQ Protocol/Report | PQ | QA + Business | QA, Product Owner |
| Validation Summary Report | Summary | Validation Lead | QA Director |
| 21 CFR Part 11 Assessment | Compliance | QA | QA, Legal |
| EU Annex 11 Assessment | Compliance | QA | QA, Legal |

## 5. Installation Qualification (IQ)

### 5.1 Objective
Verify system is installed per design specification in target environment.

### 5.2 IQ Test Cases
| IQ-ID | Component | Verification | Acceptance Criteria |
|-------|-----------|--------------|---------------------|
| IQ-001 | Kubernetes Cluster | Version, nodes, CNI, CSI | Matches TRS spec |
| IQ-002 | PostgreSQL | Version, extensions, parameters | Matches TRS spec |
| IQ-003 | Redis | Version, clustering, persistence | Matches TRS spec |
| IQ-004 | Kafka | Version, topics, replication | Matches TRS spec |
| IQ-005 | Object Storage | Buckets, versioning, encryption | Matches TRS spec |
| IQ-006 | TLS Certificates | Validity, SANs, chain | Valid, >90 days |
| IQ-007 | Secrets Manager | Secrets present, rotation config | All required secrets exist |
| IQ-008 | Network Policies | Applied, default deny | All namespaces secured |
| IQ-009 | Monitoring Stack | Prometheus, Grafana, Alertmanager | All targets UP |
| IQ-010 | Logging Stack | Loki, Promtail, retention | Logs ingesting |
| IQ-011 | Tracing | Tempo/Jaeger, sampling | Traces visible |
| IQ-012 | ML Pipeline | Kubeflow/MLflow, model registry | Pipeline runs |
| IQ-013 | Dictionary Files | MedDRA, WHODrug loaded | Current versions |
| IQ-014 | Gateway Certificates | FDA/EMA certs installed | Valid, correct CN |
| IQ-015 | Backup/DR | Jobs scheduled, retention | RPO/RTO configurable |

## 6. Operational Qualification (OQ)

### 6.1 Objective
Verify system functions per functional requirements under test conditions.

### 6.2 OQ Test Cases (Critical Path)
| OQ-ID | Function | Test Scenario | Expected Result | 21 CFR 11 Ref |
|-------|----------|---------------|-----------------|---------------|
| **Authentication & Access** |
| OQ-001 | User Login | Valid credentials + MFA | Access granted, audit log entry | 11.10(g), 11.100 |
| OQ-002 | Failed Login | Invalid credentials x5 | Account locked, audit log | 11.10(g), 11.100 |
| OQ-003 | Session Timeout | Inactive >30 min | Auto-logout, re-auth required | 11.10(f) |
| OQ-004 | Role Enforcement | Scientist accesses Admin | Access denied, audit log | 11.10(g) |
| **Literature Ingestion** |
| OQ-010 | PubMed Import | Scheduled run | Articles imported, deduped | 11.10(a), 11.10(b) |
| OQ-011 | Embase Import | OAuth auth, scheduled | Articles imported | 11.10(a), 11.10(b) |
| OQ-012 | Deduplication | Duplicate PMID imported | Single record, audit trail | 11.10(b), 11.10(e) |
| OQ-013 | Source Failure | API returns 5xx | Retry, alert, no data loss | 11.10(b), 11.10(k) |
| **AI Screening** |
| OQ-020 | Title/Abstract Screen | Valid article → prediction | Classification + confidence | 11.10(a), 11.10(b) |
| OQ-021 | Full-Text Screen | Relevant article → highlights | Spans highlighted | 11.10(a), 11.10(b) |
| OQ-022 | Human Override | Scientist changes AI | Override logged with reason | 11.10(b), 11.10(k) |
| OQ-023 | Confidence Threshold | Below threshold → review | Routed to human queue | 11.10(a), 11.10(j) |
| **Data Extraction** |
| OQ-030 | Entity Extraction | Article → Drug/AE/Patient | Entities with evidence spans | 11.10(a), 11.10(b) |
| OQ-031 | Evidence Linking | Entity → text span | Click navigates to text | 11.10(b), 11.10(k) |
| OQ-032 | Human Review | Accept/Edit/Reject | Action logged with user | 11.10(b), 11.10(k) |
| **Medical Coding** |
| OQ-040 | MedDRA Coding | Term → LLT/PT selection | Valid code, version checked | 11.10(a), 11.10(b) |
| OQ-041 | Dual Coding | Serious AE → 2 coders | Both codes recorded | 11.10(b), 11.10(k) |
| OQ-042 | Version Control | Retired code selected | Warning, prevent submit | 11.10(a), 11.10(j) |
| **Case Management** |
| OQ-050 | Case Creation | From extraction → draft | All fields populated | 11.10(a), 11.10(b) |
| OQ-051 | Review Workflow | Draft → Review → Approve | Status transitions logged | 11.10(b), 11.10(k) |
| OQ-052 | Electronic Signature | Approver signs | Unique, bound, timestamped | 11.50, 11.70, 11.100 |
| OQ-053 | Case Rejection | Reviewer rejects | Comments required, returns | 11.10(b), 11.10(k) |
| **Regulatory Submission** |
| OQ-060 | E2B(R3) Generation | Approved case → XML | Valid against XSD | 11.10(a), 11.10(b) |
| OQ-061 | Gateway Submission | XML → FDA/EMA gateway | MDN received, status updated | 11.10(a), 11.10(b) |
| OQ-062 | Submission Failure | Gateway down → retry | Queued, backoff, alert | 11.10(b), 11.10(k) |
| **Audit Trail** |
| OQ-070 | Create Event | Any create → audit | All fields captured | 11.10(a), 11.10(b) |
| OQ-071 | Update Event | Any update → audit | Old/new values, reason | 11.10(b), 11.10(e) |
| OQ-072 | Delete Event | Soft delete → audit | Reason, approver logged | 11.10(b), 11.10(e) |
| OQ-073 | Immutability | Direct DB update attempt | Blocked, alert | 11.10(c), 11.10(e) |
| OQ-074 | Hash Chain | Verify chain integrity | All hashes valid | 11.10(c), 11.10(e) |

## 7. Performance Qualification (PQ)

### 7.1 Objective
Verify system performs under production-like conditions with real data.

### 7.2 PQ Test Cases
| PQ-ID | Scenario | Load | Acceptance Criteria |
|-------|----------|------|---------------------|
| PQ-001 | Peak Ingestion | 10,000 articles/hour | Lag < 4 hours, 0 data loss |
| PQ-002 | Concurrent Screening | 50 scientists | p95 < 5s per article |
| PQ-003 | Batch Extraction | 1,000 articles | Complete < 2 hours |
| PQ-004 | Case Throughput | 200 cases/day | Creation < 4 hours avg |
| PQ-005 | Gateway Submission | 500 submissions/hour | Success rate 100%, < 5 min |
| PQ-006 | Audit Query | 10 concurrent complex | Response < 30 seconds |
| PQ-007 | ML Inference | 1000 req/min | p99 < 500ms, GPU < 80% |
| PQ-008 | DR Failover | AZ failure | RTO < 4 hours, RPO < 1 hour |
| PQ-009 | Soak Test | 72 hours continuous | No memory leaks, stable metrics |
| PQ-010 | Dictionary Upgrade | During operation | Zero downtime, no coding errors |

## 8. 21 CFR Part 11 Compliance Assessment

| Requirement | Implementation | Verification | Status |
|-------------|----------------|--------------|--------|
| **11.10(a)** System validation | IQ/OQ/PQ documented | Validation Summary Report | ✅ |
| **11.10(b)** Accurate copies | Audit trail, export | OQ-070, Export test | ✅ |
| **11.10(c)** Record protection | Immutable store, hash chain | OQ-073, OQ-074 | ✅ |
| **11.10(d)** Audit trail | All events logged | OQ-070 to OQ-072 | ✅ |
| **11.10(e)** Retention | 25 years, immutable | Config + PQ-008 | ✅ |
| **11.10(f)** Operational checks | Sequences, authority | OQ-003, OQ-004 | ✅ |
| **11.10(g)** Authority checks | RBAC, unique IDs | OQ-001, OQ-004 | ✅ |
| **11.10(h)** Device checks | Input validation | OQ-010 to OQ-013 | ✅ |
| **11.10(i)** Training | Documented, tracked | Training records | ✅ |
| **11.10(j)** Policies | SOPs, this plan | SOP library | ✅ |
| **11.10(k)** Change control | Change control process | Change control docs | ✅ |
| **11.30** E-sig uniqueness | PKI certificates | OQ-052 | ✅ |
| **11.50** E-sig components | Name, date, time, meaning | OQ-052 | ✅ |
| **11.70** E-sig linking | Bound to record | OQ-052 | ✅ |
| **11.100** Controls | MFA, passwords, timeout | OQ-001, OQ-003 | ✅ |
| **11.300** Signature manifest | Signed records list | Export function | ✅ |

## 9. EU Annex 11 Compliance Assessment

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| **1** Validation | Risk-based, documented | ✅ |
| **2** Personnel | Trained, qualified | ✅ |
| **3** Suppliers | Assessed, agreements | ✅ |
| **4** Audit trail | Immutable, attributable | ✅ |
| **5** System access | RBAC, unique IDs | ✅ |
| **6** Data integrity | ALCOA+, hash chain | ✅ |
| **7** Change control | Formal process | ✅ |
| **8** Security | mTLS, encryption, WAF | ✅ |
| **9** Incident mgmt | Runbooks, escalation | ✅ |
| **10** Business continuity | DR, backup, RPO/RTO | ✅ |
| **11** Archive | 25 years, readable | ✅ |
| **12** Audit | Internal, external | ✅ |
| **13** Documentation | Controlled, versioned | ✅ |
| **14** e-Signatures | Equivalent to handwritten | ✅ |
| **15** Validation docs | Available for inspection | ✅ |

## 10. Traceability Matrix (Summary)

| URS | FRS | TRS | OQ | PQ | Status |
|-----|-----|-----|----|----|--------|
| US-001 (Ingest) | FR-001 to FR-005 | TRS-Ingest | OQ-010 to OQ-013 | PQ-001 | ✅ |
| US-002 (Screen) | FR-010 to FR-015 | TRS-Screen | OQ-020 to OQ-023 | PQ-002 | ✅ |
| US-003 (Extract) | FR-020 to FR-025 | TRS-Extract | OQ-030 to OQ-032 | PQ-003 | ✅ |
| US-004 (Code) | FR-030 to FR-035 | TRS-Code | OQ-040 to OQ-042 | - | ✅ |
| US-005 (Case) | FR-040 to FR-050 | TRS-Case | OQ-050 to OQ-053 | PQ-004 | ✅ |
| US-006 (Submit) | FR-060 to FR-065 | TRS-Submit | OQ-060 to OQ-062 | PQ-005 | ✅ |
| US-007 (Audit) | FR-070 to FR-075 | TRS-Audit | OQ-070 to OQ-074 | PQ-006 | ✅ |

## 11. Deviation Management
| Dev-ID | Description | Severity | Root Cause | CAPA | Status |
|--------|-------------|----------|------------|------|--------|

## 12. Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Validation Lead | | | |
| QA Director | | | |
| Regulatory Affairs | | | |
| IT Director | | | |
| Product Owner | | | |

## 13. Appendices
- A: Detailed Traceability Matrix (CSV)
- B: Risk Assessment (FMEA)
- C: Test Scripts (detailed steps)
- D: Test Data Specifications
- E: Environment Configurations
- F: Vendor Assessment (Cloud, Dictionary, Gateway)