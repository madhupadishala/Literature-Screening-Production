# Nexus User Guide — Literature Screening Production

## 1. Platform Overview
**Nexus** is an AI-powered literature screening platform for pharmacovigilance and safety case processing. It automates the end-to-end workflow from literature ingestion through regulatory submission.

### What Nexus Does
| Capability | Description |
|------------|-------------|
| **Literature Ingestion** | Automated PubMed, Embase, and custom source monitoring |
| **AI Screening** | Title/abstract + full-text classification (recall >99.5%) |
| **Data Extraction** | Drug, AE, patient, study data with evidence spans |
| **Medical Coding** | MedDRA, WHODrug, ICD-10 mapping with dual-coding QC |
| **Case Management** | ICSR creation, review workflow, regulatory submission |
| **Compliance** | 21 CFR Part 11, GDPR, GAMP 5, ICH E2B(R3) |

### User Roles
| Role | Permissions |
|------|-------------|
| **Safety Scientist** | Screen, extract, code, review cases |
| **Senior Reviewer** | All scientist + approve, sign cases |
| **QA Auditor** | Read-only access to all data, audit trails |
| **Regulatory Affairs** | Review, approve, submit to gateways |
| **System Admin** | User management, configuration, monitoring |

---

## 2. Getting Started

### Access Nexus
1. Navigate to `https://nexus.yourcompany.com`
2. Sign in with SSO (Okta/Azure AD) + MFA
3. Dashboard loads based on your role

### First-Time Setup
- **Safety Scientist**: Complete training module → Assigned first screening queue
- **Reviewer**: Complete calibration exercise → Assigned review queue
- **Admin**: Configure sources, dictionaries, workflows

---

## 3. Core Modules

### 3.1 Literature Ingestion (`/ingestion`)
**Purpose**: Monitor and import literature from configured sources

**Key Actions**:
| Action | How To |
|--------|--------|
| View import status | Dashboard → Ingestion Status |
| Trigger manual import | Sources → [Source] → "Import Now" |
| Configure new source | Admin → Sources → "Add Source" |
| View failed imports | Ingestion → Errors tab |

**Fields Reference**:
| Field | Type | Description |
|-------|------|-------------|
| Source | Select | PubMed, Embase, FDA, Custom API |
| Schedule | Cron | e.g., `0 */6 * * *` (every 6 hours) |
| Query | Text | PubMed query syntax |
| Deduplication | Toggle | Auto-dedupe by PMID/DOI |

---

### 3.2 AI Screening (`/screening`)
**Purpose**: Classify articles for safety relevance

**Workflows**:

#### Title/Abstract Screening
1. Open **Screening Queue** → Assigned articles appear
2. Review AI prediction (Relevant / Not Relevant + confidence)
3. **Accept** or **Override** with reason
4. Submit → Moves to full-text queue if relevant

#### Full-Text Screening
1. Open article → AI highlights key passages
2. Verify drug/AE mentions in context
3. Confirm or correct classification
4. Submit → Relevant articles → Extraction queue

**AI Confidence Thresholds**:
| Threshold | Action |
|-----------|--------|
| ≥95% | Auto-accept (configurable) |
| 70-95% | Human review required |
| <70% | Flag for senior review |

**Keyboard Shortcuts**:
| Shortcut | Action |
|----------|--------|
| `R` | Mark Relevant |
| `N` | Mark Not Relevant |
| `O` | Override AI |
| `Space` | Next article |
| `Ctrl+Enter` | Submit batch |

---

### 3.3 Data Extraction (`/extraction`)
**Purpose**: Extract structured safety data from relevant articles

**Extraction Fields**:
| Entity | Fields | Evidence Required |
|--------|--------|-------------------|
| **Drug** | Name, role (suspect/concomitant), dose, route, dates | Text spans |
| **Adverse Event** | MedDRA term, seriousness, onset, outcome | Text spans |
| **Patient** | Age, sex, weight, medical history | Text spans |
| **Study** | Design, population, exposure, duration | Text spans |

**Workflow**:
1. Open extraction task → Article loads with AI pre-extractions
2. Review each entity → **Accept**, **Edit**, or **Reject**
3. Highlight text → Auto-links as evidence span
4. Add missing entities → "Add Drug", "Add AE"
5. Submit → Complete extraction → Coding queue

**Tips**:
- Use `Ctrl+Click` to select multiple spans for one entity
- "Propagate" copies same entity across similar articles
- Confidence score <80% → double-check manually

---

### 3.4 Medical Coding (`/coding`)
**Purpose**: Map extracted terms to standard dictionaries

**Dictionaries**:
| Dictionary | Version | Use For |
|------------|---------|---------|
| **MedDRA** | 26.0+ | Adverse events, indications |
| **WHODrug** | B3+ | Drug substances, products |
| **ICD-10** | Current | Diagnoses, comorbidities |

**Workflow**:
1. Open coding task → Extracted terms listed
2. AI suggests codes (top 3 with confidence)
3. **Select** correct LLT/PT (MedDRA) or Drug Code (WHODrug)
4. **Dual-code** for critical terms (required for serious AEs)
5. Submit → Coded data → Case creation

**Keyboard Shortcuts**:
| Shortcut | Action |
|----------|--------|
| `Tab` | Accept top suggestion |
| `↑/↓` | Navigate suggestions |
| `D` | Mark for dual-coding |
| `Enter` | Submit term |

---

### 3.5 Case Management (`/cases`)
**Purpose**: Build, review, and submit ICSRs

**Case Status Flow**:
```
DRAFT → IN_REVIEW → APPROVED → SUBMITTED → ACKNOWLEDGED
                ↓
           REJECTED (with comments)
```

**Creating a Case**:
1. **Cases** → "New Case" → Select source articles
2. Auto-populated from extraction/coding
3. Complete missing fields: reporter, patient, narrative
4. **Save Draft** → Assign to reviewer

**Reviewing a Case**:
1. **My Reviews** → Open assigned case
2. Verify: completeness, coding accuracy, narrative quality
3. **Approve** → Add electronic signature (21 CFR 11 compliant)
4. **Reject** → Add structured comments → Returns to drafter

**Regulatory Submission**:
1. Approved case → "Submit" → Select gateway (FDA/EMA/HC)
2. Auto-generates E2B(R3) XML
3. Validates against schema → Shows errors if any
4. Transmit → Receive acknowledgment → Track status

---

### 3.6 Quality & Metrics (`/quality`)
**Purpose**: Monitor screening/extraction quality

**Dashboards**:
| Metric | Target | View |
|--------|--------|------|
| Screening Recall | >99.5% | Quality → Screening |
| Screening Precision | >85% | Quality → Screening |
| Extraction Accuracy | >95% | Quality → Extraction |
| Coding Accuracy | >98% | Quality → Coding |
| Time-to-Case | <4 hours | Quality → Throughput |
| Submission Success | 100% | Quality → Submissions |

**QC Sampling**:
- Random 10% of cases → Senior reviewer re-review
- Discrepancies tracked → Feedback to AI model
- Monthly calibration exercises

---

### 3.7 Audit Trail (`/audit`)
**Purpose**: Immutable record of all actions (21 CFR Part 11)

**What's Logged**:
| Category | Examples |
|----------|----------|
| Authentication | Login, logout, failed attempts, MFA |
| Data Changes | Create, update, delete with old/new values |
| Workflow | Status changes, approvals, rejections |
| AI/ML | Model version, confidence, human overrides |
| Admin | User create, role changes, config updates |

**Querying**:
1. **Audit** → Filter by user, date, action, resource
2. Export → CSV/JSON with hash chain verification
3. Regulatory package → One-click for FDA/EMA requests

---

## 4. Administration (`/admin`)

### User Management
| Action | Path |
|--------|------|
| Add user | Admin → Users → "Invite User" |
| Assign role | Users → [User] → "Edit Roles" |
| Deactivate | Users → [User] → "Deactivate" |
| View permissions | Admin → Roles matrix |

### Source Configuration
| Setting | Description |
|---------|-------------|
| PubMed API key | NCBI API key for higher rate limits |
| Embase credentials | Elsevier API credentials |
| Custom sources | REST API endpoints with auth |
| Schedule | Cron expressions per source |
| Deduplication | PMID, DOI, title+author matching |

### Dictionary Management
| Action | Path |
|--------|------|
| Upgrade MedDRA | Admin → Dictionaries → "Upgrade" |
| View version | Dashboard shows current versions |
| Rollback | Previous version (within 30 days) |

### Workflow Configuration
| Setting | Options |
|---------|---------|
| Screening thresholds | Auto-accept confidence % |
| Dual-coding rules | Required for serious AEs |
| Reviewer assignment | Round-robin, workload-based |
| Escalation | Time-based alerts |

---

## 5. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| "No articles in queue" | Ingestion failed / schedule | Check Ingestion → Errors; trigger manual import |
| AI confidence low | New drug/AE not in training | Flag for senior review; model retrain scheduled |
| Coding suggestions wrong | Dictionary version mismatch | Verify MedDRA/WHODrug versions match |
| Submission rejected | E2B validation error | Check gateway error details; fix narrative/fields |
| Slow performance | High volume / index rebuild | Check Admin → System Health; contact support |

---

## 6. Keyboard Shortcuts (Global)

| Shortcut | Action |
|----------|--------|
| `G` then `D` | Go to Dashboard |
| `G` then `S` | Go to Screening |
| `G` then `E` | Go to Extraction |
| `G` then `C` | Go to Coding |
| `G` then `A` | Go to Cases |
| `G` then `Q` | Go to Quality |
| `?` | Show shortcuts help |
| `Ctrl+K` | Command palette |
| `Ctrl+/` | Search |

---

## 7. FAQ

**Q: How often are AI models updated?**
A: Monthly retraining with new human-reviewed data. Version in footer.

**Q: Can I export my work for offline review?**
A: Yes — Cases → Export → PDF/JSON. Screening queues → CSV export.

**Q: What if I disagree with AI extraction?**
A: Override with evidence. All overrides feed model improvement.

**Q: How are duplicate articles handled?**
A: Auto-deduplication by PMID/DOI. Manual merge available for near-duplicates.

**Q: Where do I find my training records?**
A: Profile → Training → Completion certificates, calibration scores.

---

## 8. Support & Resources

| Resource | Link |
|----------|------|
| Video Tutorials | `/help/videos` |
| API Documentation | `/api/docs` |
| Release Notes | `/releases` |
| Known Issues | `/status` |
| Support Email | `nexus-support@company.com` |
| Emergency Pager | `+1-XXX-XXX-XXXX` |

---

## 9. Compliance Quick Reference

| Regulation | Nexus Feature |
|------------|---------------|
| **21 CFR Part 11** | Audit trail, e-signatures, access control, validation |
| **GDPR** | DPIA, data minimization, right to access, encryption |
| **GAMP 5** | Validation protocols, change control, vendor assessment |
| **ICH E2B(R3)** | E2B(R3) XML generation, gateway submission |
| **MedDRA License** | Authorized user, version control, dual-coding |
| **ISO 27001** | SOC 2 Type II, penetration testing, incident response |