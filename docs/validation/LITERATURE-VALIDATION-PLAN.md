# ClinixAI Literature Screening Production — Validation Plan

Document status: Controlled template / execution framework  
Scope: Search → Hits → Screening → Review / Medical Review → Intake  
Owner: ClinixAI Validation / Quality  
System-generated evidence does **not** replace Quality approval.

## 1. Objective

Demonstrate, with traceable evidence, that the Literature Screening Production workflow performs its intended governed functions consistently and preserves tenant, configuration, source, reviewer, audit, and downstream Intake lineage.

## 2. Validation approach

The validation package combines:

1. automated executable governance checks;
2. database/schema and configuration evidence;
3. controlled positive and negative end-to-end scenarios;
4. reliability/integrity findings;
5. build-specific CI evidence;
6. IQ/OQ/PQ/UAT execution evidence;
7. independent human Validation, Quality, and Release sign-off.

## 3. Core intended-use controls

- Production literature processing follows Search → Hits → Screening → Review/MR → Intake.
- Production searches use approved Search Profiles and Literature Calendar configuration.
- Production searches generate an immutable Search Evidence Package, including zero-hit runs.
- Article-level screening is separated from patient-level review.
- Multi-patient Intake uses explicit patient-product-event assessment relations; Product × Event Cartesian inference is prohibited.
- Expectedness uses governed Label / RSI references.
- Causality uses governed approved methods.
- Human review gates remain separate from AI suggestions.
- Intake exports are immutable, checksummed, versioned, and source-lineage bound.
- RBAC, audit trail, tenant isolation, scheduler identity, reliability findings, and release evidence are retained.

## 4. Automated release gate

The System Validation Package evaluates controls defined in
`frontend/lib/validation/system-validation-governance.ts`.

An automated failure produces a **BLOCKED** validation package. A package with no automated failures may become **READY_FOR_QA_REVIEW**, but it is not approved until required human sign-offs are completed.

## 5. Required human evidence

- CI run for the exact release/build SHA.
- IQ execution record.
- OQ execution record.
- PQ/UAT execution record.
- Validation Owner sign-off.
- Quality Approver sign-off.
- Release Approver sign-off.

## 6. Deviations

Any failed or partially executed test must record:
- test/control ID;
- observed result;
- expected result;
- impact assessment;
- corrective action;
- retest evidence;
- approver and date.

## 7. Approval principle

The platform may generate evidence and enforce gates. It must never self-declare that a regulated deployment is validated.
