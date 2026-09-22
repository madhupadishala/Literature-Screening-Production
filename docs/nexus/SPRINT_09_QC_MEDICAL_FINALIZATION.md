# Nexus Sprint 9 — QC, Medical Review and Finalization

## Objective
Implement controlled independent case review, query handling and immutable finalization.

## Shared review model
Review history is append-only through `safety_case_review_actions`.

Supported review types:
- QC
- MEDICAL_REVIEW
- FINALIZATION

Supported actions:
- SUBMIT
- APPROVE
- RETURN
- QUERY
- COMMENT
- FINALIZE

## Revision binding
QC and Medical Review decisions store the exact case draft revision reviewed.

A later case-draft edit does not inherit an older approval. Finalization checks that the current draft revision has matching QC and Medical Review approvals.

## QC flow
```
PROCESSING
   ↓
Submit to QC
   ↓
READY_FOR_QC
   ├─ Approve → QC_APPROVED → Medical Review
   └─ Return / Query → QC_RETURNED → Processing
```

QC queries are stored separately and must be resolved before resubmission/finalization.

## Medical Review flow
Medical Review is available only after QC approval for the current draft revision.

```
QC_APPROVED
   ↓
Medical Review
   ├─ Approve → FINALIZATION task
   └─ Return / Query → PROCESSING
```

A Medical Review return invalidates prior operational approvals for the changed case path.

## Reviewer narrative versions
QC and Medical Review may create their own narrative revisions. These are not overwrites of the processor narrative.

## Pre-finalization policy
Finalization is blocked unless:
- patient exists;
- reporter exists;
- product exists;
- event exists;
- event chronology has no end-before-onset conflict;
- seriousness is resolved;
- serious cases contain a seriousness criterion;
- every suspect/interacting product-event pair has a human causality assessment;
- every suspect/interacting product-event pair has expectedness/listedness assessment;
- a human narrative exists;
- no review query is open;
- QC approval exists for the current draft revision;
- Medical Review approval exists for the current draft revision.

## Finalization
Finalization:
1. evaluates the current controlled draft;
2. builds the E2B(R3)-aware internal payload;
3. creates an immutable `safety_case_versions` record;
4. writes the FINAL narrative version;
5. locks the operational case;
6. records the final review action and audit event.

The immutable case version and FINAL state are committed in the same database transaction.

## Exit criteria
- QC return → correction → resubmit is supported.
- Query history is preserved.
- Medical Review approval is independent.
- Old-revision approvals cannot finalize a changed draft.
- Final case is immutable; follow-up creates a later version.
- Sprint 9 verification passes.
