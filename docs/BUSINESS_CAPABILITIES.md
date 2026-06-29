# Business Capabilities

## 1. Search Capability

Purpose: Retrieve literature hits from configured sources.

Inputs:
- Search string
- Product
- Date range
- Source
- Client configuration

Output:
- Normalized article records

Owner:
- search_engine

## 2. Screening Capability

Purpose: Determine if an article is relevant for PV review.

Inputs:
- Article title
- Abstract
- Full text where available
- Client rules
- Product rules

Output:
- Include / Exclude / Needs Review
- Confidence
- Rationale

Owner:
- screening_engine

## 3. Validity Capability

Purpose: Determine whether a record meets ICSR validity criteria.

Criteria:
- Identifiable patient
- Identifiable reporter
- Suspect product
- Adverse event

Owner:
- validity_engine

## 4. Seriousness Capability

Purpose: Identify seriousness and expedited reporting priority.

Outputs:
- Death
- Life-threatening
- SUSAR
- Other serious
- Non-serious

Owner:
- seriousness_engine

## 5. Triage Capability

Purpose: Route records to the correct workflow queue.

Owner:
- triage_engine

## 6. Deduplication Capability

Purpose: Detect possible duplicate records.

Owner:
- deduplication_engine

## 7. Submission Capability

Purpose: Prepare records for downstream reporting or export.

Owner:
- submission_engine
