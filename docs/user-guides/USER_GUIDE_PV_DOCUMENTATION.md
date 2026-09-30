# User Guide — PV Documentation

Document ID: UG-PVDOC-001  
Version: 1.0-draft  
Applies to: Cleanup Sprint 10 foundation

## Purpose

The released foundation provides a controlled PV-document repository with workspace-scoped access and append-only version snapshots.

## Create a document

1. Select the PV Documentation module in the intended workspace/environment.
2. Enter a stable document key.
3. Select the controlled document type.
4. Enter the title.
5. Provide a reason and create the root record.

## Add a version

1. Open the document.
2. Prepare the structured content.
3. Add linked-source references where applicable.
4. Enter a change reason.
5. Select the version status.
6. Enter effective dates when relevant.
7. Save the version.

The platform computes a SHA-256 hash for the content and increments the version number.

## Review and approval

DRAFT and REVIEWED changes require review authority. APPROVED, EFFECTIVE and RETIRED states require approval authority. This Sprint 10 foundation does not substitute a validated electronic-signature control.

## Retirement

A document root marked RETIRED cannot receive another in-place version through this foundation. A successor document/version relationship should be introduced through a separately governed future workflow if required.

## Important limitations

The presence of a PSMF, PVA, RMP, SOP or safety-report document type does not mean the system has automatically generated a complete compliant document. Templates, required sections, electronic signatures, controlled distribution, retention and archival rules require separate validation.

## Security and audit

All list/detail/version operations are scoped to the selected tenant, workspace and environment. Document creation is auditable, and later qualification will expand event coverage for each lifecycle transition.
