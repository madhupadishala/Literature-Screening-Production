# DPIA: Data Protection Impact Assessment

## 1. Project Overview
- **System**: [Name]
- **Data Controller**: [Company]
- **DPO**: [Name/Contact]
- **Assessment Date**: [Date]
- **Version**: [1.0]

## 2. Data Flow Description
| Data Category | Source | Purpose | Legal Basis | Retention | Recipients |
|---------------|--------|---------|-------------|-----------|------------|
| Literature metadata | PubMed/Embase | Screening | Legitimate interest | 7 years | Internal |
| Extracted PII | Full-text articles | Case processing | Legal obligation | 25 years | Regulatory authorities |
| User credentials | Auth system | Access control | Contract | Account life | Internal |
| Audit logs | System | Compliance | Legal obligation | Permanent | Auditors |

## 3. Necessity & Proportionality
- **Purpose limitation**: Only safety case processing
- **Data minimization**: Extract only required fields
- **Storage limitation**: Retention schedule enforced
- **Accuracy**: Validation rules + human review

## 4. Risk Assessment
| Risk | Likelihood | Impact | Score | Mitigation |
|------|------------|--------|-------|------------|
| Unauthorized access to PII | Medium | High | High | RBAC, encryption, audit |
| Data breach | Low | Very High | High | SOC 2, pen testing, IR plan |
| Cross-border transfer | Medium | High | High | SCCs, adequacy decisions |
| AI processing bias | Medium | Medium | Medium | Human-in-loop, monitoring |
| Retention violation | Low | High | Medium | Automated deletion, audit |

## 5. Safeguards
| Measure | Implementation |
|---------|----------------|
| Encryption in transit | TLS 1.3 minimum |
| Encryption at rest | AES-256 |
| Pseudonymization | Article IDs, not direct identifiers |
| Access control | RBAC + 2FA + session management |
| Audit logging | Immutable, tamper-evident |
| Incident response | 72-hour breach notification |
| DPO oversight | Quarterly reviews |
| Staff training | Annual GDPR/GxP training |

## 6. Data Subject Rights
| Right | Implementation |
|-------|----------------|
| Access | Self-service portal / admin request |
| Rectification | Correction workflow with audit |
| Erasure | Not applicable (legal obligation) |
| Restriction | Flag records, limit processing |
| Portability | E2B(R3) export |
| Objection | Not applicable (public interest) |

## 7. International Transfers
| Destination | Mechanism | Review Date |
|-------------|-----------|-------------|
| [Cloud region] | Adequacy / SCCs | Annual |
| [Regulatory gateway] | Legal obligation | Per submission |

## 8. Sign-Off
| Role | Name | Date |
|------|------|------|
| DPO | | |
| Legal | | |
| Business Owner | | |