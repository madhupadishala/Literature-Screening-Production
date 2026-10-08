# Drug extraction expert review handoff

Owner: qualified pharmacovigilance reviewer; safety physician adjudicates medical disagreements.
Status: NOT_REVIEWED. The software author and AI output are not expert reference labels.

## Corpus

The retained development corpus contains 34 literature-linked FAERS report candidates from 2026Q2 ASCII and openFDA. More than 30 drug records does not mean more than 30 distinct drugs. Use distinct source-visible medicinal products for the user's intended complex-case threshold. The exploratory documents PMC3787171 and PMC8127514 were used during development; exclude both from independent holdout qualification.

## First pass: linkage and independent labels

1. Read the source article without seeing model predictions or FAERS drug-role fields.
2. Verify that the article's patient matches the FAERS report. Record age, sex, reported events, timeline and patient-number evidence. Reject ambiguous multi-patient linkage.
3. Identify all source-visible medicinal products, exact mention offsets and names. Separate drugs disclosed only in later FAERS follow-up from drugs actually visible in the article.
4. Assign source-grounded SUSPECT, INTERACTING, CONCOMITANT, HISTORICAL, TREATMENT or UNKNOWN. Co-occurrence is insufficient to make a drug suspect. Record ambiguity and drug-event scope.
5. Assign COMPANY/NON_COMPANY/UNKNOWN only against a separately controlled, effective client Product Master; absence from that master is insufficient evidence of non-company ownership.
6. Record reviewer identity/qualifications, source hash and signed review time. Freeze the independent labels before running the holdout engine.

## Second pass: reference comparison and adjudication

Unblind FAERS roles and compare against the independent source labels. Differences require explanations: source/follow-up discrepancy, name normalization, ambiguity, multi-patient reporting or a genuine extraction/classification error. A second qualified reviewer adjudicates disagreements. Preserve both initial decisions and the adjudicated label; do not overwrite them with AI suggestions.

## Required evidence before a release decision

- Independent holdout manifests with source hashes, engine commit, terminology version and reference hashes.
- Per-role precision/recall, suspect false positives and false negatives, extraction recall and unresolved review rate. Undefined metrics stay null.
- Ownership and drug-event pair metrics only where expert labels actually exist.
- Separate results for spontaneous, literature, clinical trial and social-media sources; the current literature-only candidates cannot qualify all source types.
- Approved acceptance thresholds set before holdout execution, reviewer sign-off, mismatch disposition, auditability and validation traceability.

No clinical benchmark is marked passed until these records exist. The current two source-only runs are exploratory evidence, not a completed blinded expert benchmark.
