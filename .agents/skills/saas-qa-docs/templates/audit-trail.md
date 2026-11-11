# Audit Trail Specification: [System/Feature]

## 1. Overview
- **System**: [Name]
- **Audit Standard**: 21 CFR Part 11.10, EU Annex 11, ALCOA+
- **Retention**: Permanent (minimum 25 years for safety data)

## 2. Audited Events
| Event Category | Events | Fields Captured |
|----------------|--------|-----------------|
| **Authentication** | Login, logout, failed attempts, password change, 2FA enroll | User ID, timestamp, IP, user agent, success/failure, MFA method |
| **Authorization** | Role assign, permission change, access grant/revoke | Actor, target, role/permission, timestamp, reason |
| **Data Create** | Article import, case creation, extraction, coding | Record ID, user, timestamp, source, raw input |
| **Data Read** | Export, report generation, API access | User, timestamp, records accessed, filter criteria |
| **Data Update** | Field edit, status change, re-coding, reviewer decision | Record ID, user, timestamp, field, old value, new value, reason |
| **Data Delete** | Soft delete, archive, purge | Record ID, user, timestamp, reason, approver |
| **Workflow** | Screen, review, approve, submit, retract | Case ID, user, timestamp, from status, to status, comments |
| **System** | Config change, deployment, backup, restore | Component, user, timestamp, change detail, version |
| **AI/ML** | Model inference, training, version deploy | Model ID, version, input hash, output, confidence, user |

## 3. Audit Record Structure
```json
{
  "audit_id": "uuid",
  "timestamp": "ISO8601 with timezone",
  "user": {
    "id": "user-uuid",
    "email": "user@company.com",
    "role": "safety_scientist",
    "session_id": "session-uuid"
  },
  "action": "CREATE|READ|UPDATE|DELETE|WORKFLOW|SYSTEM|AI_INFERENCE",
  "resource": {
    "type": "Article|Case|Extraction|Coding|User|Config|Model",
    "id": "resource-uuid",
    "display": "Human-readable identifier"
  },
  "changes": [
    {
      "field": "field_name",
      "old_value": "previous",
      "new_value": "current",
      "reason": "User-provided justification"
    }
  ],
  "context": {
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "request_id": "req-uuid",
    "correlation_id": "corr-uuid"
  },
  "integrity": {
    "hash": "sha256-of-record",
    "chain_hash": "sha256-of-previous+current"
  }
}
```

## 4. Technical Requirements
| Requirement | Implementation |
|-------------|----------------|
| **Immutability** | Append-only store (WAL, event sourcing, blockchain) |
| **Tamper evidence** | Hash chaining (each record includes prev hash) |
| **Integrity verification** | Periodic hash chain validation job |
| **Query performance** | Indexed by user, resource, timestamp, action |
| **Export** | JSON/CSV with full chain for regulators |
| **Retention enforcement** | Automated, cannot be disabled by admin |
| **Clock sync** | NTP, timestamp from trusted time source |

## 5. Query & Reporting
| Report | Filters | Frequency |
|--------|---------|-----------|
| User activity | User, date range, action | On-demand |
| Data lineage | Resource ID, full history | On-demand |
| Regulatory submission | Case IDs, submission window | Per submission |
| Compliance audit | All, date range | Quarterly |
| Security investigation | Failed auth, privilege escalation | On-demand |

## 6. Validation Test Cases
| TC-ID | Test | Pass Criteria |
|-------|------|---------------|
| AT-001 | Create record → verify audit entry | Entry exists with all fields |
| AT-002 | Update record → verify old/new captured | Both values present |
| AT-003 | Delete record → verify audit entry | Entry with reason, approver |
| AT-004 | Attempt audit table delete → blocked | Permission denied, event logged |
| AT-005 | Hash chain verification → valid | All chains intact |
| AT-006 | Export → verify completeness | All records in range exported |
| AT-007 | Clock skew test → timestamps ordered | No duplicate timestamps |