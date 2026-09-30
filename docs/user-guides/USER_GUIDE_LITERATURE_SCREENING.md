# User Guide — Literature Screening

Document ID: UG-LIT-001  
Version: 1.0-draft  
Status: Sprint 4 controlled draft

## Access

1. Sign in with your identity.
2. Select tenant, client workspace and environment.
3. Select Literature.
4. The system revalidates entitlement, role and permission for protected actions.

Changing client or workspace does not require re-entering credentials while the identity session remains active.

## Search strategy

Define the governed search context:
- product or search strings;
- inclusion and exclusion terms;
- source/database selection;
- date or language restrictions where configured.

Do not treat a validation/test execution as a regulated production search unless its execution purpose explicitly reflects the regulated workflow.

## Ad hoc and scheduled searches

For a regulated search, verify:
- correct product/context;
- intended sources;
- expected schedule/date range;
- executed or translated queries;
- execution outcome and counts;
- Search Evidence Package.

If scheduled execution fails, use the controlled retry/recovery path rather than recreating evidence outside the system.

## Hits and duplicates

Review hits only in the selected client workspace. Duplicate intelligence may group repeated publication/source occurrences. Duplicate handling must preserve source provenance.

## Article and document processing

Article fetch, OCR, translation and normalized evidence histories are tenant-scoped. Never use another client's tenant identifier to attempt switching scope.

## Screening

Screening may include relevance, ICSR potential, automated assistance and manual review. AI output is assistance and is not authoritative source text or final medical judgment.

## Patient extraction and segmentation

Verify extracted patient evidence against the source. Correct assisted extraction only through controlled review actions and record the reason where required.

## Labeling / expectedness

For a final expectedness conclusion:
- use the governed active Label/RSI;
- verify product match;
- verify market/country;
- verify version/effective date;
- record rationale and supporting evidence.

If the correct governed reference is unavailable, do not invent a final conclusion.

## Causality

Where the workflow requires a governed causality method, use the approved method/version and an allowed conclusion. Record rationale and evidence.

## Medical Review

Authorized Medical Review users record status, final decision, comments and reason. Completed review workspaces are not ordinary editable drafts.

## Validation package and handoff

Two different actions may exist:
- **Create Validation Package** — evidence only.
- **Hand off and Create Validation Package** — evidence plus downstream handoff.

These actions are not equivalent.

## Tenant/workspace safety

The selected workspace is authoritative. Legacy request fields containing tenant identifiers must match the selected scope and cannot switch access.

## Inspection evidence

For an inspected search/review, the system should support retrieval of:
- actor/reviewer;
- tenant/workspace/environment;
- source/query/schedule;
- execution timestamp;
- counts and outcomes;
- evidence package;
- screening/review decisions;
- governed reference/version where applicable;
- downstream handoff identity.
