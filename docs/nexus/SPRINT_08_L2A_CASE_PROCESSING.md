# Nexus Sprint 8 — L2A Case Processing

## Objective
Provide a governed Level-2 assessment / case-processing workspace after Intake disposition creates a Nexus case.

## Core regulated boundary
The Intake record remains the governed source/triage decision record.

Case Processing uses a separate case-owned working draft:

```
Governed Intake
    ↓
Case shell
    ↓
Case Draft Revision 1
    ↓
Processor revisions / assessments / narrative
    ↓
QC + Medical Review
    ↓
Immutable Case Version
```

A case processor does not edit the original Intake evidence in place.

## Case workflow
Newly created cases enter `NEW` and receive a `CASE_PROCESSING` task.

Supported operational states include:
- NEW
- ASSIGNED
- PROCESSING
- READY_FOR_QC
- QC_RETURNED
- QC_APPROVED
- MEDICAL_REVIEW
- FINAL

Legacy safety-case states are preserved for compatibility.

## Case-owned draft
Every save creates a new `safety_case_draft_versions` revision with:
- complete structured draft payload;
- SHA-256;
- change reason;
- source kind;
- actor/time.

Previous revisions cannot be updated or deleted.

## Supported case structure
The case draft supports:
- identification/general data;
- reporters;
- patient;
- multiple events;
- multiple products;
- medical history;
- tests/labs;
- additional information and lineage.

## Assessments
Human product-event assessments are versioned for:
- causality;
- reporter causality;
- company causality;
- expectedness;
- listedness;
- seriousness support.

System suggestions never become these human assessments automatically.

## Narrative
Narratives preserve stage/version history:
- SOURCE_FACTS
- SYSTEM_DRAFT
- PROCESSOR
- QC
- MEDICAL_REVIEW
- FINAL

A deterministic system draft does not satisfy the human-narrative requirement for QC/finalization.

## Zero-cost dictionary boundary
No proprietary MedDRA or WHODrug content is embedded.

When a reported event is uncoded, Nexus retains the verbatim reported term and produces a `CODING_REVIEW` suggestion with `LICENSED_DICTIONARY_REQUIRED`.

Causality and expectedness/listedness are similarly human decisions. Nexus may surface evidence/completeness support but does not silently decide them.

## Follow-up handling
A follow-up Intake matched to an existing Nexus case is linked through `safety_case_followup_links` and reopens case processing. Prior immutable case versions are not overwritten.

When the updated case is finalized again, it creates a later immutable case version.

## Exit criteria
- Case worklist is tenant/module/RBAC protected.
- Intake creates a NEW case + CASE_PROCESSING task.
- Case-owned draft revisions are immutable.
- Multi-product/multi-event processing works.
- Human product-event assessments are versioned.
- Narrative stages are versioned.
- Zero-cost assist layer does not invent proprietary coding.
- Follow-up can reopen a case without altering prior case versions.
- Sprint 8 verification passes.
