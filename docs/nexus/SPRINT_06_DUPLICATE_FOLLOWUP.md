# Nexus Sprint 6 — Duplicate & Follow-Up Review

## Objective
Require every valid, triaged ICSR to undergo a governed duplicate/follow-up review before final disposition.

## Regulatory basis
EMA GVP Module VI Addendum I states that every newly received ICSR should be considered a potential duplicate and checked against existing cases. The duplicate search should consider similarities in patient, reaction/event and medicinal-product data, with other useful criteria such as country and case identifiers.

## System role
Nexus creates explainable candidate matches only. It does not automatically confirm a duplicate or follow-up.

The deterministic matcher uses:
- exact case/source identifiers, PMID/DOI where available;
- patient reference;
- date of birth;
- age and sex;
- suspect/interacting product overlap;
- event/reaction overlap;
- event onset date;
- reporter organisation/qualification;
- country;
- receipt-date proximity.

Each match score stores its contributing factors and evidence.

## Human decisions
The processor finalises one relationship:
- NEW_CASE;
- FOLLOW_UP;
- DUPLICATE;
- NOT_MATCH.

FOLLOW_UP and DUPLICATE require selection of a candidate from the latest completed run.

## Data separation
`duplicate_status` and `case_relationship` are deliberately separate.

- A confirmed DUPLICATE sets `duplicate_status = CONFIRMED_DUPLICATE`.
- FOLLOW_UP represents new information relating to an existing case and is not treated as a duplicate.
- NEW_CASE/NOT_MATCH remain unique from a duplicate-management perspective.

## Workflow
```
Valid ICSR
   ↓
DUPLICATE_REVIEW task
   ↓
Deterministic candidate search
   ↓
Ranked candidates + factor evidence
   ↓
Human relationship decision
   ↓
READY_FOR_DISPOSITION
```

## Explicit non-goals
- No probabilistic ML duplicate model.
- No autonomous duplicate confirmation.
- No external Argus/Veeva live database query.
- No master-case merge/nullification.
- No case version creation for follow-up yet.

## Exit criteria
- Duplicate search can be run only after valid formal triage.
- Every run is immutable and versioned.
- Candidates are tenant-scoped and explainable.
- Human decision is mandatory.
- FOLLOW_UP/DUPLICATE require a selected candidate.
- Completed review routes Intake to READY_FOR_DISPOSITION.
- Sprint 6 verification passes.
