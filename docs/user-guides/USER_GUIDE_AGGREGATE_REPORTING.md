# User Guide — Aggregate Reporting

Document ID: UG-AGG-001  
Version: 1.0-draft  
Applies to: Cleanup Sprint 9 foundation

## Purpose

The Sprint 9 foundation creates a controlled aggregate-report record from authoritative finalized cases and provides versioned review/approval content. It does not yet claim automated regulator-ready PSUR/PBRER/DSUR/PADER authoring.

## Create a report record

1. Enter a unique report key.
2. Select the report type.
3. Enter the reporting-period start and end dates.
4. Optionally identify the governed product key.
5. Provide a reason.
6. Create the report.

The server independently selects finalized/submitted/closed cases within the selected tenant, workspace, environment and date range. It records the final case-version IDs and hashes in the source snapshot and computes a snapshot SHA-256.

## Create a content version

Users with review authority may add a DRAFT or REVIEWED content version. APPROVED or FINALIZED versions require approval authority. Each version receives a content hash and retains its change reason and actor.

## Finalization

Once the report record is FINALIZED, the released foundation rejects in-place content version creation. Corrections/amendments require a separately governed future workflow.

## Important limitation

Selecting PSUR/PBRER, DSUR, PADER or line listing does not automatically make the content compliant with every jurisdiction. Required sections, calculations, listings, interval/cumulative logic and templates must be separately specified and validated before production regulatory use.

## Security

Worklists, detail and versions are scoped to the selected workspace/environment. Browser-provided IDs cannot expand authority.
