# Nexus Integration Guide (Interchange)

## 1. Introduction
- **Purpose**: Technical integration specifications for Nexus with external systems
- **Audience**: Integration Engineers, Solution Architects, Clinical System Admins
- **Scope**: Inbound/outbound interfaces, protocols, data mappings, testing

## 2. Integration Architecture

### 2.1 Integration Patterns
| Pattern | Use Case | Technology |
|---------|----------|------------|
| **Async Event-Driven** | High-volume, decoupled | Kafka / EventBridge |
| **Sync REST API** | Real-time queries, CRUD | OpenAPI 3.0, mTLS |
| **File-Based (Batch)** | Large datasets, scheduled | SFTP / S3 + Manifest |
| **Message-Based (HL7/E2B)** | Regulatory, clinical | AS2, MLLP, SFTP |

### 2.2 Integration Layer
```
External System → [Protocol Adapter] → [Message Validator] → [Transformer] → Nexus Core
                                                      ↓
                                              [Audit Logger]
                                                      ↓
                                              [Error Handler] → DLQ
```

## 3. E2B Gateway Integration (Regulatory Submissions)

### 3.1 Supported Gateways
| Authority | Gateway | Protocol | Version | Environment |
|-----------|---------|----------|---------|-------------|
| **FDA** | VAERS / FAERS | AS2 / SFTP | E2B(R3) | Prod / Test |
| **EMA** | EVGateway / EVHuman | AS2 / SFTP | E2B(R3) | Prod / Test |
| **Health Canada** | CESP | AS2 | E2B(R3) | Prod / Test |
| **PMDA (Japan)** | PMDA Gateway | SFTP | E2B(R3) | Prod / Test |
| **Swissmedic** | Swissmedic Gateway | AS2 | E2B(R3) | Prod / Test |
| **Custom** | Configurable | AS2/SFTP/HTTPS | E2B(R2/R3) | Configurable |

### 3.2 Gateway Configuration
| Parameter | FDA VAERS | EMA EVGateway |
|-----------|-----------|---------------|
| **Endpoint** | `https://gateway.fda.gov/as2` | `https://evgateway.ema.europa.eu` |
| **Protocol** | AS2 (HTTP/S) | AS2 (HTTP/S) |
| **Certificate** | FDA-issued X.509 | EMA-issued X.509 |
| **AS2 From** | `NEXUS_PROD` | `NEXUS_PROD` |
| **AS2 To** | `FDA_VAERS` | `EMA_EVGATEWAY` |
| **Encryption** | AES-256 (3DES fallback) | AES-256 |
| **Signature** | SHA-256 RSA | SHA-256 RSA |
| **MDN** | Signed, async | Signed, async |
| **Retry Policy** | Exp backoff (5, 15, 60m) | Exp backoff (5, 15, 60m) |

### 3.3 Submission Flow
```
1. Case Approved → "Submit" clicked
2. Generate E2B(R3) XML (ICH M2 compliant)
3. Validate against XSD (FDA/EMA specific)
4. Sign with Org certificate (PKCS#7)
5. Package: XML + Signature + Attachments
6. Transmit via AS2/SFTP
7. Receive MDN / Acknowledgment
8. Parse MDN → Update case status
9. Store: Submission package + MDN + Gateway response
10. Audit: Full chain logged (21 CFR 11)
```

### 3.4 Error Handling
| Error Type | Action | Retry |
|------------|--------|-------|
| XSD Validation Fail | Block submission, show errors | Manual fix |
| Gateway Timeout | Queue, retry with backoff | 3x (5m, 15m, 60m) |
| MDN Negative | Alert Regulatory Affairs | Manual investigation |
| Certificate Expired | Block, alert Security | Manual renew |
| Duplicate Detection | Gateway returns "Duplicate" | Link to existing, no retry |

## 4. Clinical System Integrations

### 4.1 EDC Integration (Medidata Rave, Oracle InForm, Veeva Vault EDC)
| Direction | Data | Trigger | Format |
|-----------|------|---------|--------|
| **EDC → Nexus** | SAE data, subject info, study config | On SAE entry / Scheduled | ODM XML / REST API |
| **Nexus → EDC** | Case updates, coding sync, query responses | On case approval / Coding complete | REST API / ODM |

#### 4.1.1 Medidata Rave
- **Protocol**: REST API (v2) + OAuth2
- **Authentication**: Client credentials + MFA
- **Rate Limit**: 1000 req/min
- **Key Endpoints**:
  - `GET /datasets/AdverseEvents` — Pull SAEs
  - `POST /datasets/CaseUpdates` — Push case data
  - `GET /studies/{id}/config` — Study configuration

#### 4.1.2 Oracle InForm
- **Protocol**: SOAP / REST
- **Authentication**: Basic + IP whitelist
- **Key Endpoints**:
  - `GetAdverseEvents` — Pull SAEs
  - `UpdateCase` — Push case data

#### 4.1.3 Veeva Vault EDC
- **Protocol**: REST API (v21.1+)
- **Authentication**: OAuth2 / JWT
- **Key Endpoints**:
  - `GET /api/v21.1/objects/sae__v` — Pull SAEs
  - `POST /api/v21.1/objects/case__v` — Push cases

### 4.2 CTMS Integration
| System | Protocol | Data Flow |
|--------|----------|-----------|
| **Veeva Vault CTMS** | REST | Sites, studies, enrollment → Nexus |
| **Medidata CTMS** | REST | Study config, milestones → Nexus |
| **Custom** | Configurable | Configurable |

### 4.3 Safety Database Integration (Argus, ARISg, Empirica Signal)
| System | Direction | Protocol | Use Case |
|--------|-----------|----------|----------|
| **Oracle Argus** | Bi-directional | E2B XML + API | Migration, co-existence |
| **ArisGlobal ARISg** | Bi-directional | E2B XML + API | Case sync |
| **Empirica Signal** | Outbound | API / File | Signal detection feed |

## 5. Literature Source Integration

### 5.1 PubMed/MEDLINE
- **Protocol**: NCBI E-utilities (REST)
- **Authentication**: API Key (optional, higher limits)
- **Rate Limit**: 3/sec (no key), 10/sec (with key)
- **Query**: PubMed syntax (MeSH, field tags, boolean)
- **Schedule**: Configurable cron (default 6-hourly)
- **Incremental**: Use `reldate` or `mindate`/`maxdate`

### 5.2 Embase (Elsevier)
- **Protocol**: Elsevier API (REST)
- **Authentication**: OAuth2 (client credentials)
- **Rate Limit**: Per contract (typically 1000/day)
- **Query**: Embase syntax (EMTREE, subheadings)
- **Format**: XML / JSON

### 5.3 Custom Sources
| Type | Configuration |
|------|---------------|
| **RSS/Atom Feed** | URL, XPath selectors, schedule |
| **REST API** | Endpoint, auth, query params, response mapping |
| **GraphQL** | Endpoint, query, variables, mapping |
| **SFTP/FTP** | Host, path, file pattern, parser (XML/CSV/JSON) |
| **Email** | IMAP, folder, attachment parser |

## 6. Dictionary Services Integration

### 6.1 MedDRA (MSSO)
- **Distribution**: Encrypted download (MSSO portal)
- **Format**: ASCII delimited / XML
- **Version Sync**: Bi-annual (March, September)
- **API**: MSSO browser API (optional, for real-time lookup)

### 6.2 WHODrug (Uppsala Monitoring Centre)
- **Distribution**: Encrypted download (UMC portal)
- **Format**: SDF / XML / CSV
- **Version Sync**: Quarterly (B1/B2/B3, C1/C2/C3)
- **API**: UMC API (optional)

### 6.3 ICD-10/11 (WHO)
- **Access**: WHO API / Download
- **Format**: JSON / XML
- **Updates**: Annual (ICD-10), Continuous (ICD-11)

## 7. Data Mapping & Transformation

### 7.1 Common Mapping Patterns
| Source Field | Nexus Field | Transformation |
|--------------|-------------|----------------|
| `AERefNumber` | `case.external_id` | Direct |
| `Patient/Age` | `patient.age` | Parse numeric |
| `Patient/Sex` | `patient.sex` | Map: M/F/UNK → Male/Female/Unknown |
| `Reaction/MedDRA` | `adverse_event.meddra_code` | Validate against current version |
| `Drug/Name` | `drug.name` | Fuzzy match → WHODrug |
| `Drug/Dose` | `drug.dose_amount` + `drug.dose_unit` | Split value/unit |

### 7.2 Transformation Engine
- **Tool**: Custom DSL / JSONata / XSLT
- **Testing**: Sample-based validation (100+ samples per mapping)
- **Versioning**: Git-tracked mapping files
- **Rollback**: Previous mapping version deployable

## 8. Integration Testing

### 8.1 Test Environments
| Environment | Purpose | Data |
|-------------|---------|------|
| **Sandbox** | Development testing | Synthetic |
| **Partner Test** | Vendor validation | De-identified production subset |
| **UAT** | User acceptance | Production-like |
| **Production** | Live | Real |

### 8.2 Test Cases (Per Integration)
| Category | Test Cases |
|----------|------------|
| **Happy Path** | Valid payload → Successful processing |
| **Validation** | Invalid payload → Proper error response |
| **Authentication** | Expired token, wrong cert, missing auth |
| **Rate Limiting** | Burst requests → 429 handling |
| **Timeout** | Slow response → Timeout + retry |
| **Duplicate** | Same payload twice → Idempotency |
| **Large Payload** | Max size → Performance |
| **Schema Evolution** | New fields backward compatible |

### 8.3 Test Data Management
- **Synthetic Generator**: Creates valid E2B, ODM, HL7 messages
- **Anonymization**: Production data → de-identified test data
- **Version Control**: Test data versioned with mappings

## 9. Monitoring & Operations

### 9.1 Integration Health Dashboard
| Metric | Target | Alert |
|--------|--------|-------|
| **Success Rate** | >99.5% | <99% |
| **Latency (p95)** | <30s (async), <2s (sync) | >2x target |
| **Throughput** | Per SLA | <50% expected |
| **Error Rate** | <0.1% | >0.5% |
| **Queue Lag** | <5 min | >30 min |

### 9.2 Alerting Rules
| Alert | Condition | Severity | Runbook |
|-------|-----------|----------|---------|
| Gateway Down | 3 consecutive failures | P1 | `gateway-down.md` |
| Queue Backlog | >10k messages | P2 | `queue-backlog.md` |
| Schema Validation Spike | >5% invalid | P2 | `validation-spike.md` |
| Certificate Expiring | <30 days | P3 | `cert-expiry.md` |

## 10. Security & Compliance

### 10.1 Data Protection
| Requirement | Implementation |
|-------------|----------------|
| **Encryption in Transit** | TLS 1.3 (all), AS2 encryption (E2B) |
| **Encryption at Rest** | AES-256 (databases, object storage) |
| **PII Handling** | Pseudonymization in non-prod, field-level encryption |
| **Data Minimization** | Only required fields transmitted |
| **Retention** | Per regulation (25 years safety) |

### 10.2 Audit Requirements
- All integration events logged (source, destination, payload hash, status)
- Immutable audit trail (21 CFR 11)
- Quarterly access reviews
- Annual penetration testing

## 11. Onboarding New Integrations

### 11.1 Checklist
- [ ] Requirements documented (data, frequency, SLA)
- [ ] Security review (vendor, protocol, data classification)
- [ ] Legal/Contract (BAA, DPA, liability)
- [ ] Technical spec (API spec, sample data, error codes)
- [ ] Test environment access
- [ ] Mapping document (source → Nexus fields)
- [ ] Test execution (all test cases pass)
- [ ] UAT sign-off
- [ ] Production deployment plan
- [ ] Monitoring configured
- [ ] Runbooks created
- [ ] Support contacts defined

### 11.2 Timeline
| Phase | Duration |
|-------|----------|
| Discovery & Spec | 2-4 weeks |
| Development | 4-8 weeks |
| Testing (Sandbox + Partner) | 2-4 weeks |
| UAT | 1-2 weeks |
| Production Deploy | 1 week |
| Hypercare | 2 weeks |

## 12. Appendices

### A. E2B(R3) XML Structure Reference
- ICH M2 E2B(R3) Data Elements
- FDA/EMA Regional Extensions
- Attachment Handling (Base64, referenced files)

### B. API Specifications
- Nexus REST API (OpenAPI 3.0)
- Webhook Event Schema (JSON Schema)
- Error Code Catalog

### C. Mapping Templates
- EDC ODM → Nexus Case
- CTMS Study → Nexus Configuration
- Custom Source → Nexus Article

### D. Support Contacts
- **Integration Team**: integrations@company.com
- **FDA Gateway Support**: fda-gateway@company.com
- **EMA Gateway Support**: ema-gateway@company.com
- **Vendor Escalation**: [Per vendor]