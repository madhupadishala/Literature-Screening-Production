# Nexus Sprint 7 — Intake Disposition

## Objective
Turn the completed Intake/Triage/Duplicate workflow into a commercially usable routing layer that works with or without Nexus Case Processing.

## Allowed dispositions
- CREATE_NEXUS_CASE
- EXPORT_EXTERNAL
- FOLLOW_UP_EXISTING_CASE
- DUPLICATE
- INCOMPLETE_FOLLOW_UP
- NON_CASE
- HOLD

The server derives which dispositions are allowed from the regulated Intake state and current tenant module entitlements.

## Module gating
CREATE_NEXUS_CASE is available only when:
- the ICSR is valid;
- duplicate/follow-up review is complete;
- the relationship is NEW_CASE or NOT_MATCH;
- Nexus Case Processing is effectively enabled for the tenant/environment;
- the user has the Case Create permission.

The same UI cannot bypass these server-side checks.

## Standalone Intake
A tenant without Case Processing can still:
- run Literature/Manual/API/Document Intake;
- complete source review;
- complete validity/triage;
- complete duplicate/follow-up review;
- generate a governed external handoff package.

This is the commercial boundary for Nexus Intake + Triage standalone.

## External handoff
EXPORT_EXTERNAL creates a versioned `NEXUS_SAFETY_JSON` package containing:
- structured Intake state;
- source metadata and source hash;
- patient/reporter/product/event/test records;
- source-document metadata and hashes;
- latest triage assessment;
- latest duplicate assessment;
- source lineage.

Raw uploaded document bytes are not embedded in the package.

The package receives a deterministic SHA-256 and is downloadable with audit logging.

This is a governed handoff package, not a live Argus/Veeva gateway. Direct vendor connectors remain future integration work.

## Hold semantics
HOLD and INCOMPLETE_FOLLOW_UP set `disposition_status = ON_HOLD`, not COMPLETE. This preserves the ability to continue the workflow when follow-up information arrives.

## Atomic Nexus case creation
CREATE_NEXUS_CASE and the disposition ledger execute in one database transaction. If case creation fails, the disposition is rolled back.

## Exit criteria
- Valid new cases can route to Nexus Case Processing when licensed.
- Intake-only tenants can generate an external handoff package.
- Follow-up and duplicate relationships produce constrained dispositions.
- Invalid reports can route to NON_CASE without duplicate review.
- Incomplete reports can route to ON_HOLD.
- Final dispositions are versioned and audited.
- Sprint 7 verification passes.
