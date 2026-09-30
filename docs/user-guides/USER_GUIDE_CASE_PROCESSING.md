# User Guide — Case Processing

Document ID: UG-CASE-001  
Applies to: Cleanup Sprint 6 reconciled Case Processing

## Access

1. Sign in.
2. Select tenant.
3. Select client workspace.
4. Select PROD/UAT/TRAINING.
5. Select Case Processing.
6. The server revalidates tenant permission, workspace membership, module entitlement and module role.

Changing the URL or case identifier cannot grant access to another workspace.

## Worklist

The worklist displays only cases owned by the selected workspace/environment. Priority and latest update determine operational ordering according to the configured workflow.

## Create a case

A case can be created only from a qualified upstream intake in the same workspace/environment. The system validates the intake state and prevents cross-workspace case creation. A repeated request for an already-created scoped intake returns the existing case rather than silently creating a second case.

## Process case data

Processors may maintain governed draft content while the case is editable:
- identification;
- reporter(s);
- patient;
- products;
- events/reactions;
- tests;
- medical/additional information.

A meaningful change reason is required where the workflow records a revision. Stable keys and chronology checks protect data integrity.

## Assessments

Product-event assessments store:
- assessment type;
- result;
- rationale;
- evidence;
- assessment version and actor/time.

System assistance is supporting evidence only; it does not silently replace the human regulated decision.

## Narrative

Narratives progress through controlled provenance stages such as system draft, processor, QC, medical review and final. Users shall review generated content against source evidence before accepting it.

## QC and Medical Review

QC and Medical Review are separate permission-controlled actions. Depending on workflow state, reviewers may approve, return, query or comment. Return/query paths preserve the review history instead of rewriting it.

## Finalization

Finalization requires CASE_FINALIZE permission and successful finalization checks. Once finalized, the authoritative case version is immutable. Corrections/follow-ups must use governed version/change workflows rather than editing the finalized record in place.

## Evidence and exports

Evidence packages and exports are generated from the authoritative finalized version. Their hashes and version identifiers support reproducibility and tamper detection.

## Access-denied troubleshooting

If a case is reported as not found in the selected workspace/environment:
1. confirm tenant/workspace/environment;
2. confirm module entitlement and role;
3. do not alter the ID to bypass the denial;
4. contact an authorized administrator if the case should legitimately be reassigned/migrated.

## Legacy cases

Legacy tenant-only case rows are not automatically assigned to a workspace. Production migration requires an approved mapping/reconciliation exercise. This is intentional to prevent accidental cross-client exposure.
