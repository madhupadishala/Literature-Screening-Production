# PV Safety Assessment Knowledge Audit

Status: Working design / non-production  
Branch: `feat/pv-safety-assessment-engine-v1`

## Purpose

This audit compares the current controlled Literature knowledge repository with the PV screening failures identified during manual evaluation. It prevents new AI behaviour from being represented as approved knowledge before the underlying pharmacovigilance rules have been governed.

## Existing approved knowledge that can be reused

The current approved repository already covers:

- SDI-002 Publication Classification
- SDI-003 Screening Decision Engine
- SDI-006 Publication Type Independence
- SDI-008 Evidence-Based Screening
- SDI-010 Explainable Screening
- OI-004 Safety Information Definition
- OI-005 Full-Text Acquisition
- OI-006 Full-Text Request Workflow
- VAL-001 Literature Valid Case Definition
- VAL-002 Identifiable Patient
- VAL-003 Identifiable Reporter
- VAL-004 Company Suspect Product Identification
- VAL-005 Adverse Event & Special Situation Recognition
- VAL-006 Active MAH Verification
- VAL-008 Evidence-Based Validity Assessment
- VAL-010 Explainable Regulatory Decision

These rules support a governed framework but do not contain enough detail to safely implement the complete new Safety Assessment Engine.

## Knowledge gaps requiring governed additions or revisions

### PV-SAFETY-GAP-001 — Drug role and multi-drug attribution

Required distinctions:

- suspect
- co-suspect
- concomitant
- treatment
- exposure
- combination-product ingredient
- overdose/poisoning ingestion
- discussion-only product mention
- unresolved role

Co-occurrence of a medicinal product and an event must not independently establish suspicion or causality.

### PV-SAFETY-GAP-002 — Author causality and alternative causes

The controlled knowledge needs an explicit evidence hierarchy for statements such as:

- induced by
- caused by
- attributed to
- related to / associated with
- possibly/probably related
- unlikely related
- ruled out
- secondary to another cause

Alternative etiologies, underlying disease, indication, complications and other products must be considered explicitly.

### PV-SAFETY-GAP-003 — Temporal and pharmacological relationship

Controlled rules are needed for:

- dose increase/decrease
- dose-response
- time to onset
- dechallenge
- rechallenge
- treatment withdrawal
- outcome after withdrawal
- exposure before/after event

These elements must remain source-evidence linked and shall not by themselves prove causality.

### PV-SAFETY-GAP-004 — Special-situation taxonomy

VAL-005 recognizes special situations generically and explicitly mentions pregnancy, but the production knowledge does not define a sufficiently complete controlled taxonomy for:

- misuse
- abuse
- intentional overdose
- accidental overdose
- suicide attempt / intentional poisoning
- medication error
- off-label use
- pregnancy exposure
- breastfeeding exposure
- lack of efficacy
- occupational exposure
- drug interaction
- other abnormal patterns of use

Special situations must be assessed independently from adverse-event causality.

### PV-SAFETY-GAP-005 — Symptoms versus final diagnosis

The system needs governed rules to preserve reported symptoms while prioritizing a later confirmed diagnosis where the source supports it. A symptom must not be silently converted into a diagnosis and a final diagnosis must not erase relevant symptom evidence.

### PV-SAFETY-GAP-006 — ICSR versus aggregate safety relevance

Current OI-004 defines patient-level Safety Information using an identifiable patient plus AE and/or special situation. This does not define aggregate safety relevance for reviews, cohorts, observational studies, trials, registry studies and database analyses.

The engine therefore needs separate governed outputs for:

1. patient-level / potential ICSR safety relevance;
2. aggregate safety relevance.

### PV-SAFETY-GAP-007 — Evidence availability and title-only handling

OI-005 and OI-006 govern full-text acquisition and requests, but the current controlled knowledge does not explicitly define how title-only safety evidence must be captured while retaining a limitation flag.

Required evidence levels:

- TITLE_ONLY
- ABSTRACT_ONLY
- FULL_TEXT

Explicit safety facts available at a lower evidence level must not be discarded merely because complete text is unavailable.

## Governance conflicts requiring resolution

### COI conflict

The current controlled OI-002/OI-003 hierarchy permits fallback from patient/event country to reporter country, affiliation and publication country.

The new manual evaluation requires Country of Incidence to represent the place where the patient/event/exposure occurred and rejects author affiliation alone as evidence of incidence country.

No production change should silently choose between these two rules. The controlled COI knowledge requires formal reconciliation/versioning.

### Safety-information scope conflict

OI-004 defines Safety Information using identifiable-patient criteria. The manual evaluation also requires recognition of aggregate safety findings from non-case-report literature.

The safest model is to preserve OI-004 for patient-level case safety while adding a separately governed Aggregate Safety Relevance concept.

## Runtime knowledge delivery finding

Production currently has no active tenant pgvector controlled repository configured. Controlled retrieval falls back to the bundled 80-object platform core and performs keyword ranking over short governing statements.

Consequences:

- the full section-aware controlled documents/chunks are not being used at runtime;
- requested hybrid retrieval effectively becomes keyword retrieval;
- top-K ranking can omit mandatory rules;
- a rule that exists in the repository is not guaranteed to reach the Screening model.

For regulated Safety Assessment, mandatory governing rules should be resolved by exact Knowledge Object IDs first. Semantic/agentic retrieval should then supplement those mandatory rules with relevant supporting knowledge.

## Implementation gate

Do not wire the new Safety Assessment Engine into production Screening until:

1. existing approved rules are bound explicitly by stable IDs;
2. knowledge gaps above are approved/versioned or remain visibly non-production;
3. COI conflict is resolved;
4. ICSR versus aggregate-safety scope is governed;
5. golden cases pass;
6. source evidence, applied rules and uncertainty can be reconstructed from the audit record.

## PV-SAFETY-GAP-008 — Seriousness assessment

DRAFT shared six-criterion recommendation and lexical NLP context extraction implemented in `frontend/lib/pv-safety-assessment/seriousness-engine.ts`. Exact span validation, tenant/client boundaries, uncertainty and conflict handling are included. Actual IME/CTCAE references, approved exact-rule source binding, semantic clinical validation, reviewed FAERS/gold cases, downstream workflow integration and production release gates remain open. This gap is not closed by synthetic test success.
