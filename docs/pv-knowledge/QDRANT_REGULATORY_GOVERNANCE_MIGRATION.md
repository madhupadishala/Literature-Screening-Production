# Qdrant Regulatory Governance Migration

Document ID: PV-KNOW-QDRANT-MIG-001  
Status: Controlled migration plan  
Applies to: regulatory-guidance vector points created before governed lifecycle metadata became mandatory.

## 1. Purpose

Production regulatory retrieval now requires explicit approval and effective lifecycle metadata. Legacy vector points that lack those fields must not be silently promoted or guessed into an approved state.

## 2. Required governed metadata

A production-eligible regulatory vector point must contain:

- `authority`;
- `regulatorySourceId`;
- `canonicalSourceUrl`;
- `jurisdiction`;
- `version` where applicable;
- `publicationDate` where available;
- `effectiveDate`;
- `lifecycleStatus` using the controlled values `DRAFT`, `FUTURE_EFFECTIVE`, `EFFECTIVE`, `SUPERSEDED`, `RETIRED`, or `REJECTED`;
- `approvalStatus` using `PENDING`, `APPROVED`, or `REJECTED`;
- `supersedesSourceId` / `supersededBySourceId` / `supersededAt` when applicable;
- source checksum and citation fields already required by the knowledge pipeline.

## 3. Legacy-point rule

Legacy regulatory points with missing governance fields are **not production eligible**.

They shall not be backfilled to `APPROVED` or `EFFECTIVE` from filename, vector payload, model inference, URL, or free-text heuristics.

## 4. Migration procedure

For each authoritative source intended for production:

1. identify the source in the controlled regulatory source register;
2. reacquire or verify the controlled original;
3. verify checksum, revision/version, jurisdiction, publication date and effective date;
4. obtain human regulatory approval;
5. assign controlled lifecycle and approval statuses;
6. re-run parsing and structure-aware chunking;
7. regenerate embeddings using the approved embedding configuration;
8. upsert the governed points with the complete metadata set;
9. validate retrieval/citation behavior;
10. only after successful replacement, remove obsolete legacy points for that source.

## 5. Current baseline

The Sprint 1 controlled source catalog currently contains **zero production-approved regulatory sources**. Therefore no legacy vector point may be treated as approved merely to preserve search results.

Until a source completes the controlled migration above, governed production retrieval is expected to return no approved context for that source.

## 6. Current retrieval rule

For current regulatory retrieval:

- `approvalStatus = APPROVED`;
- `lifecycleStatus = EFFECTIVE`;
- `effectiveDate <= asOf/current time`;
- `supersededBySourceId` must be absent;
- `SUPERSEDED` and `RETIRED` records are excluded.

Historical retrieval is explicit and date-scoped. It may include `SUPERSEDED` records only when requested and must preserve superseded status in the returned citation/provenance.

## 7. Validation evidence

The migration is complete for a source only when:

- old and new point counts are reconciled;
- no ungoverned regulatory point is returned by production retrieval;
- citation/source/version/effective-date filters are verified;
- authorization scope is verified;
- the source's controlled approval record exists;
- retrieval regression and regulatory review pass.

No broad backfill or default-approved migration is permitted.
