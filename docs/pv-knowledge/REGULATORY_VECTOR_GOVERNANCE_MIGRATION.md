# Regulatory Vector Governance Migration

Document ID: PV-KNOW-VECTOR-MIG-001  
Status: Controlled migration rule  
Applies to: Existing regulatory vectors created before source lifecycle/approval/effective-date metadata became mandatory.

## Safety rule

Existing vector points with missing governance metadata shall **not** be auto-promoted or inferred as approved.

Production regulatory retrieval requires:
- approvalStatus = APPROVED;
- lifecycleStatus = EFFECTIVE for current retrieval;
- effectiveDate less than or equal to the retrieval as-of date;
- no populated supersededBySourceId for current retrieval;
- explicit asOf when superseded historical material is intentionally requested.

Points missing any required production-governance field are therefore excluded from governed production retrieval.

## Migration strategy

Legacy regulatory vectors shall be reconciled by controlled **rebuild from the authoritative source record**, not by mass-setting missing fields.

For each source/version:

1. Resolve the source to the controlled regulatory source catalog/approved artifact.
2. Verify official origin, jurisdiction, version/revision and checksum.
3. Confirm publication/effective dates and lifecycle state.
4. Confirm human approval status.
5. Reparse/rechunk when the stored chunk cannot be proven to derive from the approved artifact.
6. Regenerate embeddings with the governed embedding model/version.
7. Upsert the rebuilt vector payload with full provenance fields.
8. Validate retrieval and citations.
9. Remove or quarantine the superseded legacy points only after the rebuilt points are verified.

## Prohibited backfill

Do not:
- set approvalStatus=APPROVED merely because a legacy point exists;
- infer EFFECTIVE from absence of a supersession marker;
- invent effective dates;
- copy jurisdiction/version values from a different source revision;
- make previously excluded legacy vectors eligible solely to preserve result counts.

## Historical retrieval

Historical retrieval that includes superseded sources requires an explicit caller-provided asOf date. Historical results remain labelled SUPERSEDED and retain their source/version provenance.

## Qualification evidence

Before production cutover of the governed vector path, retain evidence of:
- count of legacy regulatory points missing required governance fields;
- source/version mapping outcome;
- rebuilt point count;
- rejected/unmapped point count;
- checksum/source provenance;
- retrieval regression;
- current retrieval excludes future/superseded/unapproved/missing-governance points;
- date-scoped historical retrieval returns only eligible historical records;
- reviewer approval.

## Failure rule

If a legacy point cannot be unambiguously mapped to an approved controlled source/version, it remains excluded from production regulatory retrieval.
