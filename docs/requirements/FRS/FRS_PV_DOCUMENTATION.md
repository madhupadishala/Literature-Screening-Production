# FRS — PV Documentation

Document ID: FRS-PVDOC-001  
Version: 1.0-draft  
Linked URS: URS-PVDOC-001

| FRS ID | Linked URS | Functional requirement |
|---|---|---|
| FRS-PVD-001 | URS-PVD-001–003 | All PV-document routes shall use requireWorkspaceModulePermission with NEXUS_MODULES.PV_DOCUMENTATION. |
| FRS-PVD-002 | URS-PVD-004–005 | Root documents shall persist controlled document_key, document_type, title and lifecycle status. |
| FRS-PVD-003 | URS-PVD-010–012 | nexus_pv_document_versions shall append numbered content snapshots with content_sha256 and status. |
| FRS-PVD-004 | URS-PVD-011,017 | Each version shall retain change reason, linked_sources, actor and created_at. |
| FRS-PVD-005 | URS-PVD-013 | PV_DOCUMENT_REVIEW shall govern draft/reviewed versions; APPROVED/EFFECTIVE/RETIRED transitions shall require PV_DOCUMENT_APPROVE. |
| FRS-PVD-006 | URS-PVD-014–015 | Service/database shall validate effective date windows. |
| FRS-PVD-007 | URS-PVD-016 | Service shall reject new in-place versions for RETIRED document roots. |
| FRS-PVD-008 | URS-PVD-020–021 | Retrieval and mutation shall include tenant_id, workspace_id and environment and create scoped audit evidence for material actions. |
| FRS-PVD-009 | URS-PVD-030–032 | The foundation shall not introduce hard module dependencies or claim e-signature/records-management validation. |
| FRS-PVD-010 | URS-PVD-040 | Automated verification shall inspect scope, hashes, versioning, date checks and role separation. |
| FRS-PVD-011 | URS-PVD-041 | cleanup:sprint10:verify and normal CI/security/regression gates shall block qualification on failure. |

## API surface

- GET/POST `/api/pv-documents`
- GET `/api/pv-documents/{documentId}`
- POST `/api/pv-documents/{documentId}/versions`

## Permission profile

PV_DOCUMENT_VIEW, PV_DOCUMENT_CREATE, PV_DOCUMENT_REVIEW, PV_DOCUMENT_APPROVE and PV_DOCUMENT_EXPORT are separate controlled permissions.
