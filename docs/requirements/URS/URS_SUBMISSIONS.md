# URS — Submissions Foundation

Document ID: URS-SUB-001  
Version: 1.0-draft  
Status: Cleanup Sprint 7 controlled draft  
Benchmark: BENCH-SUB-001

| ID | User requirement |
|---|---|
| URS-SUB-001 | Submissions shall be independently entitleable at tenant/workspace/environment level. |
| URS-SUB-002 | Access shall require authenticated identity, selected workspace and SUBMISSIONS module role/permission. |
| URS-SUB-003 | Submission records shall belong to exactly one tenant/workspace/environment. |
| URS-SUB-004 | Cross-workspace/environment submission identifiers shall fail closed. |
| URS-SUB-005 | A submission package shall be created only from an authoritative finalized case version in the same workspace/environment. |
| URS-SUB-006 | Mutable case drafts shall not be used as submission authority. |
| URS-SUB-007 | The source case version/hash shall be retained in package provenance. |
| URS-SUB-008 | Destination type, destination key and message profile shall be explicit. |
| URS-SUB-009 | Package payload shall be deterministic/reproducible from the authoritative case and controlled destination parameters. |
| URS-SUB-010 | Package SHA-256 shall support integrity verification. |
| URS-SUB-011 | Package creation shall support an idempotency key and shall not silently duplicate a submission package on retry. |
| URS-SUB-012 | Package creation, transmission and acknowledgment permissions shall be separable. |
| URS-SUB-013 | External network transport shall be implemented only through a governed transport adapter. |
| URS-SUB-014 | Absence of a configured/validated adapter shall fail closed and shall not simulate successful submission. |
| URS-SUB-015 | Every transmission attempt shall retain attempt number, adapter identity, request hash, status and outcome metadata. |
| URS-SUB-016 | Failed transmission shall be retryable without changing the authoritative package payload. |
| URS-SUB-017 | Successful transmission shall record an external message identifier where provided. |
| URS-SUB-018 | Acknowledgments shall be durable and idempotent by controlled external acknowledgment identity. |
| URS-SUB-019 | Acknowledgment status shall support accepted, partial, rejected, technical-error and pending outcomes. |
| URS-SUB-020 | Package status shall reflect transmission/acknowledgment lifecycle and shall not mark unacknowledged transmissions as accepted. |
| URS-SUB-021 | Audit history shall retain scoped actor/action/outcome for material submission actions. |
| URS-SUB-022 | External adapter credentials/secrets shall never be stored in source control or package payloads. |
| URS-SUB-023 | Destination-specific regulatory validation shall be separate from generic package lifecycle logic. |
| URS-SUB-024 | A destination/profile not explicitly supported by an adapter shall fail closed. |
| URS-SUB-025 | Submission retrieval/worklists shall be scoped to selected workspace/environment. |
| URS-SUB-026 | Transport replay shall be governed by attempt history and package idempotency. |
| URS-SUB-027 | A rejected/technical-error ACK shall remain visible; it shall not erase the successful network transmission record. |
| URS-SUB-028 | The platform shall not claim regulator connectivity or validation without objective conformance evidence. |
| URS-SUB-029 | External adapter activation shall require security, CSV/validation and regulated-business approval as applicable. |
| URS-SUB-030 | Submissions shall consume a stable Case Processing contract and shall not require Intake/Literature module entitlement. |
| URS-SUB-031 | Migration/schema changes shall be additive and governed. |
| URS-SUB-032 | Automated CI shall verify package, permission, workspace, idempotency, adapter-fail-closed and acknowledgment foundations. |
| URS-SUB-033 | CodeRabbit/Hacker/Evidence gates shall remain mandatory for qualification. |

## Acceptance

Sprint 7 can be described as a qualified **Submissions foundation** only after all nine applicable gates pass on the exact commit. Real external transport remains separately unqualified until credentialed conformance and validation evidence exists.
