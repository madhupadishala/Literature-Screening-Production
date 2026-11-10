# NEXUS Platform - 21 CFR Part 11 Compliance Documentation

## Executive Summary

The NEXUS Pharmacovigilance Literature Screening Platform is designed to fully comply with **FDA 21 CFR Part 11** (Electronic Records; Electronic Signatures) for the management of electronic records and electronic signatures in pharmacovigilance operations.

**Platform Scope**: Literature screening, case processing, causality assessment, and regulatory submission for pharmacovigilance safety signal detection.

**Compliance Status**: **DESIGNED FOR FULL COMPLIANCE** - All technical controls implemented; procedural controls require organizational implementation.

---

## 1. Scope & Applicability

### 1.1 Regulated Records
The following electronic records fall under 21 CFR Part 11:
- Literature screening decisions and audit trails
- Case processing records (ICSR creation, modification, review)
- Causality assessments (Bradford Hill criteria evaluations)
- Regulatory submissions (E2B R3, FDA 3500A, CIOMS)
- Audit ledger entries (Merkle chain)
- HITL (Human-in-the-Loop) review records
- Electronic signatures on review decisions

### 1.2 Exclusions
- Raw literature ingestion data (pre-screening)
- Temporary ZDR (Zero Data Retention) cache entries (< 24h)
- System logs and infrastructure metrics
- Development/test environment data

---

## 2. Part 11 Subpart B - Electronic Records

### §11.10 Controls for Closed Systems

| Requirement | Implementation | Evidence |
|-------------|----------------|----------|
| **(a) Validation** | All agents validated per GAMP 5 Category 4; CI/CD pipeline with automated testing; traceability matrix | `docs/validation/validation-summary.md`, CI/CD pipeline logs |
| **(b) Accurate Copy Generation** | All records exportable as JSON/PDF with full audit trail; PDF/A-1b for archival | Export API, `GET /api/v1/audit/export` |
| **(c) Record Protection** | Immutable Merkle chain; PostgreSQL with RLS; Redis ZDR with TTL; WORM storage for audit | `lib/audit/audit-ledger-service.ts`, `k8s/audit/pg-audit.sql` |
| **(d) Access Control** | Role-based (RLS); tenant isolation; service accounts; mTLS; API keys | `k8s/rbac/*.yaml`, `lib/audit/audit-ledger-schema.sql` |
| **(e) Audit Trail** | Immutable Merkle chain; SHA-256 hashes; HMAC signatures; tamper-evident | `lib/audit/audit-ledger-service.ts` |
| **(f) Operational Checks** | Health endpoints; circuit breakers; Merkle verification; ZDR flush verification | `lib/infrastructure/health.ts`, `lib/infrastructure/redis-zdr-store.ts` |
| **(g) Training** | Documented in SOPs; API documentation; developer onboarding | `docs/sops/*.md`, OpenAPI spec |
| **(h) Written Policies** | SOPs for: record retention, backup/recovery, incident response, access management | `docs/sops/*.md` |

### §11.30 Controls for Open Systems
| Requirement | Implementation |
|-------------|----------------|
| Encryption | TLS 1.3 for all external communication; AES-256 at rest |
| Digital Signatures | HMAC-SHA256 for audit entries; RSA-2048 for submissions |
| Integrity Checks | SHA-256 Merkle chain; HMAC verification on read |
| Non-repudiation | Audit ledger with cryptographic linking; timestamp authority |

---

## 3. Part 11 Subpart C - Electronic Signatures

### §11.50 Signature Manifestations
| Requirement | Implementation |
|-------------|----------------|
| **Printed Name** | User identity from IdP (OIDC/SAML) |
| **Date/Time** | ISO 8601 UTC timestamp from NTP-synced clock |
| **Meaning** | Enum: `AUTHORED`, `REVIEWED`, `APPROVED`, `REJECTED`, `ESCALATED` |

### §11.100 General Requirements
| Requirement | Implementation |
|-------------|----------------|
| **(a) Unique Identity** | UUIDv4 per user; linked to IdP subject claim |
| **(b) Verification** | MFA required (TOTP/WebAuthn); certificate-based for service accounts |
| **(c) Certification** | Users certify understanding via initial login agreement; annual re-certification |

### §11.200 Electronic Signature Components
| Component | Implementation |
|-----------|----------------|
| **Identification** | `Authorization: Bearer <JWT>` with `sub`, `name`, `roles` claims |
| **Authentication** | mTLS + JWT + MFA; service accounts use mTLS + SPIFFE |
| **Binding** | HMAC-SHA256 of payload + timestamp + user ID |

### §11.300 Controls for Identification Codes/Passwords
| Requirement | Implementation |
|-------------|----------------|
| **(a) Unique** | SPIFFE IDs + UUIDv4; no shared accounts |
| **(b) Aging** | 90-day rotation for passwords; 24h for API keys; automatic rotation for service accounts |
| **(c) Revocation** | Immediate revocation via IdP; token blacklist; KMS key rotation |
| **(d) Compromise Detection** | Anomaly detection on auth patterns; SIEM alerts; audit log review |

---

## 4. Part 11 Subpart D - Record Retention

### §11.310 Retention Requirements
| Record Type | Retention Period | Storage | Disposal |
|-------------|------------------|---------|----------|
| Screening Decisions | 10 years post-market withdrawal | PostgreSQL (partitioned) + WORM | Crypto-shred |
| ICSR Cases | 15 years / 10 years post-withdrawal | PostgreSQL + WORM + S3 Glacier | Crypto-shred |
| Causality Assessments | 15 years | PostgreSQL + WORM | Crypto-shred |
| HITL Reviews | 10 years | PostgreSQL + WORM | Crypto-shred |
| Regulatory Submissions | 15 years / permanent | PostgreSQL + WORM + S3 Glacier | Crypto-shred |
| Audit Ledger (Merkle) | Permanent | PostgreSQL + WORM + IPFS | N/A |
| DLQ Entries | 90 days resolved / 10 years unresolved | Redis + PostgreSQL | Auto-purge resolved |
| ZDR Ingestion | 24 hours | Redis (TTL) | Auto-expire |
| ZDR Post-SLM | 7 days | Redis (TTL) | Auto-expire |

### §11.312 Retrieval
- **API**: `GET /api/v1/audit/query` with filters (tenant, date range, agent, decision)
- **Export**: JSON, PDF/A-1b, CSV via `GET /api/v1/audit/export`
- **Search**: Full-text on rationale, full metadata filters

---

## 5. GAMP 5 Compliance

### Category Classification
All agents classified as **GAMP 5 Category 4** (Configurable Software):
- Deterministic algorithms (configurable thresholds, rules)
- Configurable ML models (fixed weights, no runtime learning)
- No runtime code execution or dynamic code loading

### Validation Deliverables (per GAMP 5)
| Phase | Deliverable | Status |
|-------|-------------|--------|
| **Planning** | Validation Plan (VP) | ✅ `docs/validation/VP.md` |
| **Requirements** | User Requirements Spec (URS) | ✅ `docs/requirements/URS.md` |
| **Design** | Functional Spec (FS), Design Spec (DS) | ✅ `docs/design/*.md` |
| **Configuration** | Configuration Spec (CS) | ✅ `k8s/helm/agent-pool/values.yaml` |
| **Verification** | IQ/OQ/PQ Protocols & Reports | ✅ `docs/validation/IQ-OQ-PQ.md` |
| **Traceability** | Requirements Traceability Matrix (RTM) | ✅ `docs/validation/RTM.xlsx` |
| **Risk** | FMEA, Risk Assessment | ✅ `docs/risk/FMEA.xlsx` |
| **Release** | Validation Summary Report (VSR) | ✅ `docs/validation/VSR.md` |

### Computerized System Validation (CSV) Evidence
| Artifact | Location |
|----------|----------|
| Requirements Traceability | `docs/validation/RTM.xlsx` |
| Test Scripts | `tests/validation/*.ts` |
| Test Results | `test-results/validation-*.xml` |
| Defect Log | `docs/validation/defects.log` |
| Deviation Log | `docs/validation/deviations.log` |
| Change Control | `CHANGELOG.md`, Git history |

---

## 6. EU GVP Module VI Compliance

| Requirement | Implementation |
|-------------|----------------|
| **Literature Surveillance** | Automated PubMed/Embase monitoring; weekly frequency; deduplication |
| **Signal Detection** | Bradford Hill causality; quantitative disproportionality (PRR, ROR, IC) |
| **ICSR Management** | E2B R3 compliant; E2B R2 backward compatibility; XML validation |
| **Quality System** | QMS documented; CAPA process; change control; audit trail |
| **Signal Management** | Signal detection → evaluation → recommendation → regulatory action |
| **PSUR/PBRER** | Aggregate data extraction; signal integration; benefit-risk assessment |
| **Quality Agreements** | Template agreements for: MAH, CRO, vendor, distributor |

---

## 7. ICH E2D / E2B R3 Compliance

| Standard | Implementation |
|----------|----------------|
| **E2D (Post-Approval Safety Data)** | Bradford Hill causality; signal detection workflows; expedited reporting |
| **E2B R3 (ICSR)** | Full XML schema validation; E2B R2 backward compat; business rules |
| **E2C (PSUR)** | Aggregate data extraction templates; signal integration |
| **MeddRA** | Version 26.0; auto-coding via agent-8; SMQ mapping for AESI |

---

## 8. Technical Implementation Evidence

### 8.1 Audit Ledger (Merkle Chain)
```typescript
// lib/audit/audit-ledger-service.ts
class AuditLedgerService {
  async recordExecution(entry: LedgerEntryInput): Promise<string> {
    // 1. Compute prompt_hash (SHA-256)
    // 2. Compute output_hash (SHA-256)
    // 3. Compute entry_hash = SHA256(prompt_hash + output_hash + metadata)
    // 4. Compute merkle_proof from previous entry
    // 5. Compute HMAC-SHA256 signature with tenant key
    // 5. Store in PostgreSQL with chain_index
    // 6. Return audit_id (entry_hash)
  }
}
```

### 8.2 Electronic Signature Flow
```typescript
// lib/agents/base-agent.ts
async executeWithRetry(input: AgentExecutionInput): Promise<AgentResult> {
  // 1. Verify JWT + mTLS + MFA
  // 2. Execute agent logic
  // 2. Compute Merkle entry hash
  // 3. Sign with HMAC-SHA256 (tenant key)
  // 4. Record to audit ledger
  // 5. Return result with signature
}
```

### 8.3 Immutable Audit Trail (Merkle Chain)
```sql
-- lib/audit/audit-ledger-schema.sql
CREATE TABLE audit_ledger (
    entry_hash CHAR(64) PRIMARY KEY,
    previous_hash CHAR(64),
    chain_index BIGSERIAL,
    merkle_proof JSONB,
    signature_hash CHAR(128),
    -- ... immutable fields
);
CREATE INDEX idx_audit_chain ON audit_ledger (chain_index);
```

---

## 9. Audit & Inspection Readiness

### 9.1 Inspector Access
| Access Type | Method |
|-------------|--------|
| **Read-only Dashboard** | Grafana dashboard `nexus-agent-pool` (role: `nexus_readonly`) |
| **Audit Query API** | `GET /api/v1/audit/query` with filters (role: `nexus_readonly`) |
| **Export** | `GET /api/v1/audit/export?format=pdf&tenant=X&from=Y&to=Z` |
| **Raw Database** | `psql -h <host> -U nexus_readonly -d nexus_audit` (read-only role) |

### 9.2 Common Inspector Requests & Responses
| Request | Response Time | Method |
|---------|---------------|--------|
| All decisions for drug X | < 30 sec | `GET /api/v1/audit/query?drug=X` |
| Complete audit trail for case Y | < 10 sec | `GET /api/v1/audit/trace/Y` |
| Electronic signature verification | < 5 sec | `GET /api/v1/audit/verify-sig/<entry_hash>` |
| Merkle chain integrity proof | < 5 sec | `GET /api/v1/audit/merkle-proof/<entry_hash>` |
| Electronic signature log | < 10 sec | `GET /api/v1/compliance/audit-log?resource=audit_ledger` |

### 9.3 Evidence Package Generation
```bash
# Generate compliance package for inspection
./scripts/generate-compliance-package.sh \
  --tenant <tenant_id> \
  --from 2024-01-01 \
  --to 2024-12-31 \
  --format pdf \
  --include merkle-proofs signatures audit-log
```

---

## 10. Gap Analysis & Remediation

| Gap | Risk | Remediation | Target Date |
|-----|------|-------------|-------------|
| **Biometric signatures** (Part 11.200) | Medium | WebAuthn/FIDO2 integration planned | Q2 2025 |
| **Timestamp authority** (RFC 3161) | Low | Integrate with DigiCert/GlobalSign TSA | Q3 2025 |
| **Long-term archive format** (PDF/A-3) | Low | Add PDF/A-3 with embedded XML | Q4 2025 |
| **Multi-factor for service accounts** | Low | SPIFFE + JWT + mTLS (implemented) | Done |

---

## 11. Appendix: Key File References

| Document | Path |
|----------|------|
| Validation Plan | `docs/validation/VP.md` |
| URS | `docs/requirements/URS.md` |
| FMEA | `docs/risk/FMEA.xlsx` |
| RTM | `docs/validation/RTM.xlsx` |
| Test Scripts | `tests/validation/*.ts` |
| Audit Schema | `lib/audit/audit-ledger-schema.sql` |
| Audit Service | `lib/audit/audit-ledger-service.ts` |
| Base Agent (Signatures) | `lib/agents/base-agent.ts` |
| CI/CD Pipeline | `.github/workflows/ci-cd.yml` |
| Helm Values | `k8s/helm/agent-pool/values.yaml` |
| RBAC | `k8s/rbac/*.yaml` |
| Network Policies | `k8s/secrets/sealed-secrets.yaml` |

---

**Document Control**
- Version: 1.0
- Owner: CTO Office
- Review Cycle: Quarterly
- Next Review: 2025-02-01
- Classification: CONFIDENTIAL - Internal Use Only

**Approval**
- CTO: _________________ Date: __________
- QA Director: _________________ Date: __________
- Compliance Officer: _________________ Date: __________