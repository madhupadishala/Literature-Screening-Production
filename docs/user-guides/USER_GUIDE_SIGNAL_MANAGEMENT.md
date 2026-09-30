# User Guide — Signal Management

Document ID: UG-SIGNAL-001  
Version: 1.0-draft  
Applies to: Cleanup Sprint 8 foundation

## Purpose

This guide describes the released Signal Management foundation: creating a governed signal record, reviewing the scoped worklist, recording assessments and progressing a signal through controlled lifecycle states.

## Prerequisites

The user must be authenticated, have an active tenant/workspace/environment context, have SIGNAL_MANAGEMENT entitlement and an assigned module role with the needed permission.

## Create a signal

1. Open the Signal Management workspace.
2. Enter a stable signal key, product key and event term.
3. Select the governed source type.
4. Record the source reference where available.
5. Record the detection method and detection timestamp.
6. Include the detection snapshot or supporting structured result.
7. Select priority.
8. Provide a reason and create the record.

The system stores the detection snapshot hash so the detection evidence can be checked for integrity.

## Review the worklist

The worklist contains only records belonging to the selected tenant, workspace and environment. Changing the browser identifier or calling another workspace's signal ID does not grant access.

## Record an assessment

Users with SIGNAL_ASSESS may record validation, prioritization, evaluation, recommendation or closure-assessment content. The assessment requires an outcome and rationale and may include structured evidence.

Each assessment is appended as a new version and receives an evidence hash.

## Lifecycle

Allowed transitions are:

- DETECTED → VALIDATED or REFUTED
- VALIDATED → UNDER_EVALUATION or REFUTED
- UNDER_EVALUATION → CONFIRMED or REFUTED
- CONFIRMED → CLOSED
- REFUTED → CLOSED

CONFIRMED and CLOSED require SIGNAL_APPROVE authority.

## Important cautions

A detection method label or statistical output does not by itself mean that the system has validated a statistical signal. Sprint 8 does not yet claim production validation of PRR, ROR, IC, EBGM/MGPS or other quantitative algorithms. AI/statistical outputs remain supporting evidence until governed human review/approval.

## Audit and inspection evidence

Signal assessments generate scoped audit evidence. The signal detail retains assessment versions, evidence hashes, actor attribution and timestamps.

## Troubleshooting

If access is denied, verify tenant/workspace/environment, module entitlement, active role and permission. Invalid lifecycle transitions are rejected and should be corrected through the permitted workflow rather than bypassed.
