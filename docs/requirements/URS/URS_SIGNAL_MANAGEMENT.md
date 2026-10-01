# URS — Signal Management

Document ID: URS-SIGNAL-001  
Version: 1.0-draft  
Status: Cleanup Sprint 8 controlled draft  
Benchmark: BENCH-SIGNAL-001

| ID | User requirement |
|---|---|
| URS-SIG-001 | Signal Management shall be independently entitleable by tenant, workspace and environment. |
| URS-SIG-002 | Every operational Signal API shall require authenticated identity, selected workspace and SIGNAL_MANAGEMENT module authorization. |
| URS-SIG-003 | Signal records shall belong to exactly one tenant, workspace and environment. |
| URS-SIG-004 | Cross-workspace/environment signal identifiers shall fail closed. |
| URS-SIG-005 | Signal creation shall preserve product, event, source type, source reference, detection method and detection timestamp. |
| URS-SIG-006 | Detection input shall retain a reproducible snapshot and integrity hash. |
| URS-SIG-007 | Signal keys shall be unique within a tenant/workspace/environment. |
| URS-SIG-010 | The governed lifecycle shall distinguish DETECTED, VALIDATED, UNDER_EVALUATION, CONFIRMED, REFUTED and CLOSED. |
| URS-SIG-011 | Invalid lifecycle transitions shall fail closed. |
| URS-SIG-012 | Validation/evaluation/refutation assessments shall require controlled assessment authority. |
| URS-SIG-013 | Confirmation and closure shall require separate approval authority. |
| URS-SIG-014 | Every assessment shall preserve assessment type, outcome, rationale, evidence hash, version, actor and timestamp. |
| URS-SIG-015 | Assessment history shall be append-only; prior assessment versions shall not be silently overwritten. |
| URS-SIG-016 | Signal status changes shall be attributable to a recorded assessment. |
| URS-SIG-020 | Signal worklists shall be scoped to the selected workspace/environment. |
| URS-SIG-021 | Signal detail shall expose its governed assessment history only within authorized scope. |
| URS-SIG-022 | Audit records shall identify tenant, workspace, environment, module, actor, action and outcome. |
| URS-SIG-030 | Signal sources shall support spontaneous cases, literature, clinical, regulatory, aggregate and other governed source classes. |
| URS-SIG-031 | Statistical/AI detection outputs shall never become final confirmed signals without governed review/approval. |
| URS-SIG-032 | Statistical algorithms shall be versioned and validated before production decision use. |
| URS-SIG-033 | AI/model use shall retain model/policy/source provenance where it materially contributes to assessment. |
| URS-SIG-040 | The module shall remain plug-and-play and shall not require purchase of Literature, Intake, Case Processing or Aggregate Reporting. |
| URS-SIG-041 | Upstream data integrations shall use controlled contracts/events rather than private-table coupling. |
| URS-SIG-050 | Security verification shall include cross-workspace IDOR, permission separation, invalid transition and malformed payload cases. |
| URS-SIG-051 | TypeScript, architecture, dependency-security, regression, CodeRabbit, Hacker and Evidence gates shall pass before qualification. |

## Acceptance

Sprint 8 qualifies only the governed Signal Management foundation when all ten mandatory gates are satisfied for the exact commit. Production statistical detection, AI decisioning and external integrations remain separately validated capabilities.
