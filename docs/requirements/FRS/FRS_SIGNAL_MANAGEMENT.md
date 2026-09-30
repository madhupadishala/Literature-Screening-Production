# FRS — Signal Management

Document ID: FRS-SIGNAL-001  
Version: 1.0-draft  
Linked URS: URS-SIGNAL-001

| FRS ID | Linked URS | Functional requirement |
|---|---|---|
| FRS-SIG-001 | URS-SIG-001–004 | Signal routes shall use requireWorkspaceModulePermission with NEXUS_MODULES.SIGNAL_MANAGEMENT and scoped permissions. |
| FRS-SIG-002 | URS-SIG-003–004,020–021 | All signal and assessment persistence queries shall include tenant_id, workspace_id and environment. |
| FRS-SIG-003 | URS-SIG-005–007 | createSignal shall persist controlled source identity, detection method, detected_at and canonical snapshot SHA-256. |
| FRS-SIG-004 | URS-SIG-010–011 | Service logic shall enforce explicit allowed lifecycle transitions and reject all non-declared transitions. |
| FRS-SIG-005 | URS-SIG-012–013 | SIGNAL_ASSESS shall govern normal assessment transitions; CONFIRMED and CLOSED transitions shall require SIGNAL_APPROVE. |
| FRS-SIG-006 | URS-SIG-014–016 | nexus_signal_assessments shall version assessments and persist evidence_sha256, actor, assessed_at and optional next_status. |
| FRS-SIG-007 | URS-SIG-015 | Existing assessment rows shall not be updated in place as the normal assessment workflow. |
| FRS-SIG-008 | URS-SIG-022 | Material assessment actions shall create scoped audit events. |
| FRS-SIG-009 | URS-SIG-030–033 | Detection snapshot and method shall remain provenance only until the corresponding analytic/model method is separately validated. |
| FRS-SIG-010 | URS-SIG-040–041 | Signal Management shall use platform auth/RBAC/audit and stable upstream contracts; no hard commercial entitlement dependency shall be introduced. |
| FRS-SIG-011 | URS-SIG-050 | Automated verification shall inspect scope constraints, route guards, lifecycle control and permission separation. |
| FRS-SIG-012 | URS-SIG-051 | cleanup:sprint8:verify plus the normal quality/security/regression gates shall block qualification on failure. |

## API surface

- GET/POST `/api/signals`
- GET `/api/signals/{signalId}`
- POST `/api/signals/{signalId}/assessments`

## Permission profile

- SIGNAL_VIEW — worklist/detail.
- SIGNAL_CREATE — create a detected signal record.
- SIGNAL_ASSESS — validation, prioritization, evaluation, recommendation and refutation workflow.
- SIGNAL_APPROVE — confirmation/closure transitions.

## Current limitation

The Sprint 8 foundation stores a governed detection snapshot and method identity but does not itself implement or validate PRR/ROR/IC/EBGM/OE/statistical engines. Those capabilities require separate algorithm specifications, datasets, validation and acceptance evidence.
