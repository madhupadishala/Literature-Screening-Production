# User Guide — Intake & Triage

Document ID: UG-INTAKE-001  
Version: 1.0-draft  
Status: Sprint 5 controlled draft

## Access

1. Sign in.
2. Select tenant, client workspace and environment.
3. Select Intake.
4. The system revalidates Intake entitlement, role and permission on protected actions.

## Create Intake

Supported controlled source channels include:
- manual structured entry;
- external/API structured input;
- source document upload;
- canonical Literature handoff.

The selected workspace is authoritative. Do not use request payload tenant fields to switch client scope.

## Source review

Review the original source and extracted information before downstream decisions where required. Confirm source identity, receipt date and relevant safety information.

## Extraction

AI or automation may suggest values. Suggested values remain reviewable. Correct them through the controlled workflow and preserve supporting source evidence.

## Triage

Evaluate the minimum valid ICSR criteria according to the governed workflow. If required information remains unresolved, do not force a valid-case outcome.

## Duplicate and follow-up review

Potential duplicates must be reviewed before uncontrolled case creation. Confirm whether the information represents:
- a new case;
- a duplicate;
- follow-up to an existing case;
- another controlled disposition.

Record the rationale where the workflow requires it.

## Disposition

Controlled disposition actions include approved workflow outcomes such as creating a Case Processing handoff or exporting externally where enabled.

### Create Case

The system verifies:
1. Intake processing permission;
2. selected client/workspace/environment;
3. Case Processing entitlement in that same workspace;
4. Case Processing create permission.

A second login is not required.

### External export

External export requires Intake export permission and a controlled destination/handoff package.

## Handoff packages

Use the generated canonical handoff package rather than copying data from private Intake tables. Preserve the package/version identity for downstream traceability.

## Documents

Source documents are client/workspace scoped. A document identifier from another client must not be usable in the current context.

## Audit and inspection

For an inspected Intake record, evidence should support:
- source/channel;
- receipt dates;
- actor/reviewer;
- extraction/source evidence;
- triage outcome;
- duplicate/follow-up decision;
- disposition rationale;
- handoff identity;
- tenant/workspace/environment;
- audit trail.
