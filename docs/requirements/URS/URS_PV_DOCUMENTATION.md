# URS — PV Documentation

Document ID: URS-PVDOC-001  
Version: 1.0-draft  
Status: Cleanup Sprint 10 controlled draft  
Benchmark: BENCH-PVDOC-001

| ID | User requirement |
|---|---|
| URS-PVD-001 | PV Documentation shall be independently entitleable by tenant, workspace and environment. |
| URS-PVD-002 | All operational APIs shall require PV_DOCUMENTATION workspace/module authorization. |
| URS-PVD-003 | Document identifiers shall fail closed across workspace/environment boundaries. |
| URS-PVD-004 | Each document shall have a stable key, controlled document type and title. |
| URS-PVD-005 | Supported controlled types shall include PSMF, PVA, RMP, SOP, work instruction, safety report, signal document, risk document, training and other governed content. |
| URS-PVD-010 | Document content shall be stored as append-only numbered versions. |
| URS-PVD-011 | Each version shall retain content hash, change reason, actor and timestamp. |
| URS-PVD-012 | Versions shall support DRAFT, REVIEWED, APPROVED, EFFECTIVE and RETIRED states. |
| URS-PVD-013 | Review and approval authority shall be separable. |
| URS-PVD-014 | EFFECTIVE versions shall require an effective-from date and may retain an effective-until date. |
| URS-PVD-015 | Effective-until shall not precede effective-from. |
| URS-PVD-016 | Retired document roots shall not receive new in-place versions. |
| URS-PVD-018 | Lifecycle transitions shall be forward-governed: DRAFT → REVIEWED → APPROVED → EFFECTIVE → RETIRED; direct status skipping and post-effective regression shall be rejected. |
| URS-PVD-017 | Linked sources shall remain version-level provenance and shall not be silently removed from prior versions. |
| URS-PVD-020 | Worklists and detail retrieval shall be scoped to tenant/workspace/environment. |
| URS-PVD-021 | Material create/version/review/approval activity shall be auditable. |
| URS-PVD-030 | The module shall remain plug-and-play and may consume controlled content from Signal, Aggregate, Case or external governed sources without hard entitlement dependencies. |
| URS-PVD-031 | A document type label shall not imply that all required sections/templates are automatically compliant. |
| URS-PVD-032 | Electronic signature controls, retention schedules and certified records management shall be separately specified/validated before being claimed. |
| URS-PVD-040 | Security verification shall include cross-workspace IDOR, role separation, invalid date windows and retired-document mutation. |
| URS-PVD-041 | All ten mandatory gates shall pass before qualification. |

## Acceptance

Sprint 10 qualifies the controlled PV-document repository/version/lifecycle foundation only. Electronic signatures, collaborative redlining, automated PSMF/aggregate authoring and external publishing require separate governed implementation and validation.
