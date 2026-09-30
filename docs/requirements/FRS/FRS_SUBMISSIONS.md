# FRS — Submissions Foundation

Document ID: FRS-SUB-001  
Version: 1.0-draft  
Linked URS: URS-SUB-001

| FRS ID | Linked URS | Functional requirement / verification |
|---|---|---|
| FRS-SUB-001 | URS-SUB-001–004 | SUBMISSIONS shall exist in module registry, have a controlled permission surface, and use requireWorkspaceModulePermission on every route. |
| FRS-SUB-002 | URS-SUB-003–004,025 | All submission package/attempt/ACK tables shall include tenant_id, workspace_id and environment; service queries shall use all three. |
| FRS-SUB-003 | URS-SUB-005–007 | createSubmissionPackage shall join safety_cases to final_version_id and accept only FINALIZED/SUBMITTED/CLOSED authoritative cases in the selected workspace. |
| FRS-SUB-004 | URS-SUB-006 | No submission package builder shall read safety_case_draft_versions as authoritative payload. |
| FRS-SUB-005 | URS-SUB-008–010 | Package payload shall contain source version/hash and destination/profile; canonicalSha256 shall produce package_sha256. |
| FRS-SUB-006 | URS-SUB-011,026 | nexus_submission_packages shall enforce scoped idempotency_key uniqueness and service shall reuse an existing scoped package for a repeated key. |
| FRS-SUB-007 | URS-SUB-012 | Permission taxonomy shall define submission.view/create/transmit/acknowledge independently. |
| FRS-SUB-008 | URS-SUB-013–014,024 | SubmissionTransportAdapter shall isolate transport. If no supporting adapter exists, an attempt shall fail with TRANSPORT_NOT_CONFIGURED and package status FAILED. |
| FRS-SUB-009 | URS-SUB-015–017 | Each transmit call shall allocate an attempt number, record adapter/request hash, and persist success/failure with external message ID/metadata. |
| FRS-SUB-010 | URS-SUB-016,026 | Retransmission shall use the same immutable package hash and create a new attempt rather than a new package. |
| FRS-SUB-011 | URS-SUB-018–020 | Acknowledgment endpoint/service shall validate controlled status, received time, hash payload and upsert idempotently by scoped external_ack_id. |
| FRS-SUB-012 | URS-SUB-020,027 | ACCEPTED maps package to ACKNOWLEDGED; REJECTED/TECHNICAL_ERROR maps to REJECTED; other ACK states do not falsely mark acceptance. |
| FRS-SUB-013 | URS-SUB-021 | Create and acknowledgment actions shall create scoped audit records; transmission attempt rows remain durable operational evidence. |
| FRS-SUB-014 | URS-SUB-022 | Adapter secrets shall be runtime-only and absent from database package payloads/source control. |
| FRS-SUB-015 | URS-SUB-023,029 | Destination-specific schema/business/conformance validation belongs in governed adapter/profile implementations and requires separate qualification. |
| FRS-SUB-016 | URS-SUB-025 | GET worklist/detail shall filter tenant+workspace+environment. |
| FRS-SUB-017 | URS-SUB-028 | User Guide/status shall explicitly distinguish foundation readiness from external regulator connectivity. |
| FRS-SUB-018 | URS-SUB-030 | Source contract shall be final case version; no entitlement dependency on Literature or Intake is introduced. |
| FRS-SUB-019 | URS-SUB-031 | Migration 035 shall create package/attempt/ACK tables and be registered in the governed migration registry. |
| FRS-SUB-020 | URS-SUB-032–033 | cleanup:sprint7:verify plus TypeScript/lint/build/security/CodeRabbit/Hacker evidence shall gate qualification. |

## API surface

- GET/POST `/api/submissions`
- GET `/api/submissions/{submissionId}`
- POST `/api/submissions/{submissionId}/transmit`
- POST `/api/submissions/{submissionId}/acknowledgements`

## Production adapter qualification

A concrete adapter must separately define and validate:
- destination identity and endpoint allowlist;
- authentication/credential storage;
- TLS/network controls;
- message profile/version and destination business rules;
- regulator/partner conformance test evidence;
- timeout/retry/idempotency semantics;
- MDN/ACK correlation where applicable;
- sensitive-data logging/redaction;
- operational monitoring and incident recovery.

No adapter is considered production-ready solely because it implements the interface.
