# Nexus Safety Administrator's Guide

## 1. Introduction
- **Purpose**: Administrative configuration of Nexus Safety module
- **Audience**: System Administrators, Safety System Owners, IT Operations
- **Prerequisites**: Admin role, understanding of pharmacovigilance workflows

## 2. System Architecture
- **Deployment Model**: [Cloud/On-premise/Hybrid]
- **Components**: Web UI, API Gateway, Processing Engine, Database, Message Queue
- **Integration Points**: E2B Gateway, Clinical Systems, Dictionary Services

## 3. User & Access Management

### 3.1 User Provisioning
| Action | Steps | Validation |
|--------|-------|------------|
| Create user | Admin → Users → "Create" → Fill details → Assign role | Email verification, MFA enrollment |
| Bulk import | Admin → Users → "Import CSV" → Map fields → Validate → Import | Duplicate check, role validation |
| Deactivate | Users → [User] → "Deactivate" → Confirm | Immediate session termination |

### 3.2 Role-Based Access Control (RBAC)
| Role | Modules | Permissions |
|------|---------|-------------|
| Safety Scientist | Screening, Extraction, Coding, Cases | Create, Read, Update (own) |
| Senior Reviewer | All Scientist + Cases | Approve, Sign, Reject |
| QA Auditor | All | Read-only, Export audit |
| Regulatory Affairs | Cases, Submissions | Review, Approve, Submit |
| System Admin | All + Admin | Full CRUD, Config |

### 3.3 Permission Matrix (Granular)
| Permission | Scientist | Reviewer | QA | Regulatory | Admin |
|------------|-----------|----------|-----|------------|-------|
| Screen articles | ✅ | ✅ | ✅ | ❌ | ✅ |
| Extract data | ✅ | ✅ | ✅ | ❌ | ✅ |
| Code terms | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create case | ✅ | ✅ | ❌ | ❌ | ✅ |
| Approve case | ❌ | ✅ | ❌ | ✅ | ✅ |
| Sign case (e-sig) | ❌ | ✅ | ❌ | ✅ | ✅ |
| Submit to gateway | ❌ | ❌ | ❌ | ✅ | ✅ |
| View audit trail | ❌ | ✅ | ✅ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ❌ | ✅ |
| Configure sources | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage dictionaries | ❌ | ❌ | ❌ | ❌ | ✅ |

## 4. Literature Source Configuration

### 4.1 Source Types
| Source | Protocol | Auth | Rate Limit | Schedule |
|--------|----------|------|------------|----------|
| PubMed | REST/Entrez | API Key | 3/sec (10/sec with key) | Every 6 hours |
| Embase | REST/Elsevier | OAuth2 | Per contract | Every 6 hours |
| ClinicalTrials.gov | REST | None | 5/sec | Daily |
| Custom RSS | RSS/Atom | Basic/Bearer | Configurable | Configurable |
| Custom API | REST/GraphQL | Configurable | Configurable | Configurable |

### 4.2 Source Setup Wizard
1. **Admin → Sources → "Add Source"**
2. Select source type
3. Enter credentials (stored encrypted in Vault)
4. Define search query (PubMed syntax)
5. Set schedule (cron expression)
6. Configure deduplication rules
7. Test connection → Save

### 4.3 Deduplication Rules
| Rule | Description | Priority |
|------|-------------|----------|
| PMID match | Exact PMID match | 1 (highest) |
| DOI match | Exact DOI match | 2 |
| Title + Authors | Fuzzy match (90% similarity) | 3 |
| Title + Journal + Year | Exact match | 4 |

## 5. Dictionary Management

### 5.1 Supported Dictionaries
| Dictionary | Versioning | Update Frequency | License |
|------------|------------|------------------|---------|
| MedDRA | 26.0, 25.1, 24.0... | Bi-annual (Mar/Sep) | Subscription |
| WHODrug Global | B3, B2, B1... | Quarterly | Subscription |
| WHODrug Enhanced | C3, C2... | Quarterly | Subscription |
| ICD-10-CM/PCS | Annual (Oct) | Annual | Free |
| ICD-11 | Continuous | Continuous | Free |

### 5.2 Dictionary Upgrade Procedure
```
PRE-REQUISITES:
☐ Current version backed up
☐ License verified for new version
☐ Downtime window scheduled (2-4 hours)
☐ Rollback plan documented

STEPS:
1. Admin → Dictionaries → "Upgrade"
2. Select target version
3. Upload distribution files (encrypted)
4. Validation: schema check, code integrity
5. Staging environment: full regression test
6. Production: maintenance mode → deploy → verify
7. Post-upgrade: coding QC on sample (100 cases)
8. Sign-off: QA + Safety Lead

ROLLBACK:
- Restore previous version from backup
- Re-index coding cache
- Notify users of temporary revert
```

### 5.3 Version Coexistence
- **Active version**: Used for new coding
- **Previous version**: Read-only for 90 days (case re-coding)
- **Archive**: Older versions → cold storage

## 6. Business Rules Configuration

### 6.1 Screening Rules
| Rule Type | Configuration | Example |
|-----------|---------------|---------|
| Auto-accept threshold | Confidence % | 95% |
| Auto-reject threshold | Confidence % | 30% |
| Mandatory fields | Field list | Drug, AE, Patient age/sex |
| Duplicate check | Enable + rules | PMID + DOI |

### 6.2 Coding Rules
| Rule | Options | Default |
|------|---------|---------|
| Dual-coding required | Serious AE / All AE / Never | Serious AE |
| Coding hierarchy | LLT → PT → HLT → HLGT → SOC | Standard |
| Auto-suggest count | 3 / 5 / 10 | 3 |
| Version lock | Prevent coding on retired versions | Enabled |

### 6.3 Case Workflow Rules
| Rule | Configuration |
|------|---------------|
| Reviewer assignment | Round-robin / Workload-based / Specialty-based |
| Escalation timer | 24h / 48h / 72h |
| Re-review trigger | Major amendment / New serious AE |
| Auto-archive | After 365 days in SUBMITTED |

## 7. Reporting Rules

### 7.1 Expedited Reports (15-day / 7-day)
| Parameter | Configuration |
|-----------|---------------|
| Trigger | Serious + Unexpected + Related |
| Timeline | 15 calendar days (7-day for death/life-threatening) |
| Recipients | Regulatory authority, Sponsor, QA |
| Format | E2B(R3) XML |

### 7.2 Periodic Reports (PSUR/PBRER)
| Parameter | Configuration |
|-----------|---------------|
| Frequency | 6-monthly / Annual / 3-yearly |
| Data lock point | Configurable per product |
| Template | EU / FDA / Custom |
| Review workflow | Author → Review → QA → Sign → Submit |

## 8. Audit & Compliance Configuration

### 8.1 Audit Trail Settings
| Setting | Options | Default |
|---------|---------|---------|
| Retention | 7/10/25/Perpetual years | 25 years |
| Granularity | Field-level / Record-level | Field-level |
| Export format | CSV / JSON / PDF | JSON (with hash chain) |
| Real-time streaming | Kafka / Kinesis / None | Kafka |

### 8.2 21 CFR Part 11 Compliance
| Control | Implementation |
|---------|----------------|
| System validation | Documented (IQ/OQ/PQ) |
| Audit trail | Immutable, tamper-evident |
| Electronic signatures | Unique, biometric/PKI |
| Record retention | 25 years minimum |
| Access control | Unique IDs, MFA, auto-timeout |
| Device checks | Input validation, checksums |
| Training | Documented, role-based |

## 9. Integration Configuration

### 9.1 E2B Gateway
| Gateway | Endpoint | Protocol | Certificates |
|---------|----------|----------|--------------|
| FDA VAERS | https://gateway.fda.gov | AS2 / SFTP | FDA-issued |
| EMA EVGateway | https://evgateway.ema.europa.eu | AS2 / SFTP | EMA-issued |
| Health Canada | https://hc-sc.gc.ca | AS2 | HC-issued |
| PMDA Japan | https://pmda.go.jp | SFTP | PMDA-issued |
| Custom | Configurable | AS2/SFTP/HTTPS | Custom |

### 9.2 Clinical System Integrations
| System | Integration Type | Data Flow |
|--------|------------------|-----------|
| EDC (Medidata Rave, Oracle InForm) | API / FTP | Case ↔ Study data |
| CTMS | API | Site, subject, enrollment |
| Veeva Vault Safety | API | Bi-directional case sync |
| Empirica Signal | API | Signal detection feed |
| Argus (migration) | ETL / API | Historical case import |

## 10. Monitoring & Maintenance

### 10.1 Health Checks
| Check | Frequency | Alert Threshold |
|-------|-----------|-----------------|
| API responsiveness | Every 5 min | >2s p95 |
| Ingestion lag | Every 15 min | >4 hours |
| Processing queue depth | Every 5 min | >1000 messages |
| Disk space | Hourly | >80% |
| Certificate expiry | Daily | <30 days |

### 10.2 Scheduled Maintenance
| Task | Frequency | Window |
|------|-----------|--------|
| Dictionary upgrade | Bi-annual | Weekend, 4h |
| Index rebuild | Monthly | Weekend, 2h |
| Log rotation | Daily | 03:00 UTC |
| Backup verification | Weekly | Sunday, 2h |
| Security patches | Monthly | Patch Tuesday + 7 days |

### 10.3 Disaster Recovery
| Component | RPO | RTO | Method |
|-----------|-----|-----|--------|
| Database | 1 hour | 4 hours | Point-in-time recovery |
| File storage | 24 hours | 8 hours | Cross-region replication |
| Configuration | 0 (Git) | 1 hour | GitOps / IaC |
| Dictionary files | 0 (Versioned) | 2 hours | Artifact repository |

## 11. Troubleshooting Quick Reference

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| Ingestion stuck | Source API rate limit / auth expiry | Check credentials, adjust schedule |
| Coding suggestions missing | Dictionary not loaded / version mismatch | Verify dictionary status, reload |
| Case submission fails | E2B validation error / gateway down | Check validation errors, gateway status |
| Slow screening | Model serving latency / queue backup | Scale inference workers, check queue |
| User access denied | Role misconfiguration / sync lag | Verify RBAC, force directory sync |

## 12. Appendices

### A. Configuration File Reference
- `config/sources.yaml` — Source definitions
- `config/dictionaries.yaml` — Dictionary versions
- `config/rules.yaml` — Business rules
- `config/gateways.yaml` — E2B endpoints

### B. API Endpoints for Automation
- `POST /admin/users` — Provision users
- `POST /admin/sources` — Configure sources
- `POST /admin/dictionaries/upgrade` — Trigger upgrade
- `GET /admin/health` — System health

### C. Support Contacts
- **Vendor Support**: Oracle Argus / Nexus Support Portal
- **Internal IT**: [Contact]
- **QA/Regulatory**: [Contact]
- **Emergency**: [24/7 Pager]