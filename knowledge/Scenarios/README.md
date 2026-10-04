# Decision Scenarios Knowledge

This folder contains curated PV decision scenarios used to improve machine judgement, consistency and regression safety.

## Purpose

Scenarios help the machine understand how approved rules behave in realistic situations, especially when:
- several facts are present but only some are causally related;
- evidence is incomplete or contradictory;
- a product is mentioned but not suspect;
- a special situation exists without a reportable ADR;
- an article is safety-relevant but not a valid ICSR;
- patient/product/event relationships span multiple sections;
- title/abstract/full-text evidence leads to different confidence levels;
- multiple engines must reach consistent conclusions.

Scenarios are **examples and precedents**, not primary regulatory authority.

## Canonical hierarchy

```text
knowledge/Scenarios/
├── General/
├── Edge-Cases/
├── Ambiguous-Conflicting/
├── Multi-Drug/
├── Special-Situations/
├── ICSR-Validity/
├── Seriousness/
├── Causality/
├── Literature-Screening/
├── Aggregate-Safety/
├── Signal/
├── Duplicate/
├── Day-Zero/
├── Cross-Engine/
├── Adversarial/
├── Regression/
├── Golden-Cases/
└── Templates/
```

## Scenario package

Each scenario should be stored as a versioned package:

```text
<Scenario-ID>/
├── scenario.json
├── narrative.md
├── evidence/
├── expected/
└── qa/
```

## Required scenario metadata

Every scenario must declare:
- stable scenario ID;
- title;
- version;
- governance status;
- synthetic/real/source-derived provenance;
- decision domain;
- evidence level;
- applicable SOP rule IDs;
- applicable regulatory references;
- applicable controlled Knowledge Object IDs;
- input facts;
- expected decision;
- expected rationale;
- prohibited conclusions;
- ambiguity/conflict flags;
- human-review requirement;
- regression criticality;
- approval metadata when applicable.

## Governance

Allowed statuses:
- DRAFT
- REVIEWED
- APPROVED
- EFFECTIVE
- SUPERSEDED
- RETIRED

Only APPROVED/EFFECTIVE scenarios may be used as production decision exemplars.

A scenario must never:
- override an applicable regulation;
- override an effective SOP;
- override a mandatory Controlled Approved Knowledge rule;
- convert a model inference into a source fact;
- be used as the sole basis for a regulated decision.

## Retrieval order

For regulated decisions:
1. mandatory SOP/regulatory/controlled rules;
2. source evidence;
3. approved scenario precedents/examples;
4. optional supporting RAG/Agentic RAG context.

The engine should use scenarios to answer:
- "Have we seen a similar governed situation before?"
- "What mistakes must be avoided?"
- "What relationships were decisive?"
- "What evidence was insufficient?"
- "What conclusion is prohibited by the governing rules?"

## Scenario types

### General
Normal/common PV scenarios used to teach expected behaviour.

### Edge-Cases
Rare or easily misclassified cases, including exceptions and boundary conditions.

### Ambiguous-Conflicting
Conflicting evidence, incomplete facts, multiple plausible etiologies, inconsistent author statements or unclear chronology.

### Adversarial
Cases deliberately designed to expose unsafe shortcuts such as co-occurrence = causality, missing-evidence = absence, title keyword = valid ICSR, or death = fatal event.

### Regression
Scenarios linked to a past defect or model failure. They must pass after every change that touches the related engine.

### Golden-Cases
High-value QA-approved canonical cases used for release validation and model/engine benchmarking.
