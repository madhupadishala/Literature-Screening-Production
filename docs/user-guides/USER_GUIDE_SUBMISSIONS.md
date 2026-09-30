# User Guide — Submissions Foundation

Document ID: UG-SUB-001  
Applies to: Cleanup Sprint 7 canonical Submissions foundation

## What this release provides

This release provides a controlled submission-package lifecycle:
- select a finalized case;
- create/reuse a deterministic submission package;
- review package provenance/hash;
- attempt transmission through a governed adapter;
- track attempts;
- record/view acknowledgments.

It does **not** by itself establish connectivity to any regulator or partner.

## Access

1. Sign in and select tenant/workspace/environment.
2. Select Submissions.
3. The system revalidates the SUBMISSIONS entitlement, module role and requested permission.

## Create package

Required information:
- finalized case ID;
- destination type;
- destination key;
- message profile (defaults to ICH_E2B_R3 in the foundation);
- idempotency key;
- meaningful reason.

The source case must be finalized and belong to the selected workspace/environment. The package records the final case version and case hash. Repeating the same idempotency key returns the existing package rather than creating a duplicate.

## Review package

The package detail shows:
- source case/version;
- destination/profile;
- status;
- package hash;
- source-case hash;
- transmission attempts;
- acknowledgments.

## Transmit

Transmission requires a separate permission.

If no governed adapter supports the destination, the operation **fails**. The platform records a failed attempt; it does not display a fake success.

A production adapter must be separately configured and validated with the appropriate regulator/partner credentials and conformance evidence.

## Retry

A failed package may be retransmitted. A retry creates another attempt while retaining the same immutable package content/hash.

## Acknowledgment

Authorized acknowledgment processing records:
- external ACK ID;
- ACK type;
- status;
- payload hash/content;
- received time.

Accepted ACK → package ACKNOWLEDGED.  
Rejected or technical-error ACK → package REJECTED.  
Pending/partial states remain visible and do not falsely indicate acceptance.

## Important interpretation

TRANSMITTED means the configured transport adapter reported successful transmission. It does not mean the regulator accepted the report. Regulator/partner acceptance is represented only by the appropriate acknowledgment evidence.

## Troubleshooting

**Package cannot be created:** verify that the case is finalized and belongs to the selected workspace/environment.

**No transport configured:** this is a controlled fail-closed state. An administrator must deploy and validate a governed adapter; users must not bypass it.

**ACK rejected:** review the retained ACK details and applicable destination validation rules. Do not overwrite or delete the failed history.

## Current limitation

No regulator-specific transport is activated by Sprint 7 itself. FDA/EMA/MHRA/PMDA/other gateway connectivity requires destination credentials, profile-specific validation, conformance testing and production approval.
