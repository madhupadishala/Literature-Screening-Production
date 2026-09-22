# Nexus Sprint 5 — ICSR Validity + Triage

## Objective
Convert a source-verified Intake into a governed PV triage decision without bypassing human medical/PV judgement.

## Current regulatory basis
The decision model follows the four minimum ICSR criteria in ICH E2D(R1):
- at least one AE/ADR or other reportable observation;
- at least one suspect or interacting medicinal product;
- an identifiable patient;
- at least one identifiable reporter.

EMA has stated that, pending GVP updates, ICH E2D(R1) recommendations should be applied where they affect existing GVP guidance.

Seriousness follows the established ICH criteria:
- death;
- life-threatening;
- inpatient hospitalisation or prolongation;
- persistent/significant disability or incapacity;
- congenital anomaly/birth defect;
- important medical event.

## Governance model
The system produces a deterministic recommendation from the structured Intake record. The processor must explicitly confirm or change:
- each minimum criterion;
- overall validity;
- seriousness and seriousness criteria;
- special situations;
- operational priority;
- follow-up requirement and reasons;
- final rationale.

The system derives the next routing state to avoid contradictory combinations.

## Validity consistency
- VALID requires all four human-confirmed minimum criteria = MET.
- INVALID requires at least one criterion = MISSING.
- UNRESOLVED requires at least one criterion = MISSING or UNRESOLVED.
- Missing criteria are not silently discarded; due-diligence follow-up can be required.

## Triage outcomes
- VALID -> READY_FOR_DUPLICATE_REVIEW.
- INVALID -> NOT_VALID_ICSR.
- UNRESOLVED + follow-up -> FOLLOW_UP_REQUIRED.
- UNRESOLVED without follow-up -> HOLD_FOR_CLARIFICATION.

Sprint 5 does not perform duplicate/follow-up matching; that is Sprint 6.

## Seriousness
SERIOUS requires at least one positive seriousness criterion. NON_SERIOUS cannot contain a positive seriousness criterion. UNRESOLVED is allowed when current evidence is insufficient.

## Special situations
The workspace can capture:
- pregnancy;
- breastfeeding;
- paediatric;
- elderly;
- overdose;
- off-label use;
- misuse;
- abuse;
- medication error;
- occupational exposure;
- lack of therapeutic efficacy;
- falsified medicinal product.

Detection is a conservative system recommendation only; the human decision is authoritative.

## Review task integration
The TRIAGE review task created with the Intake is completed only when the formal Sprint 5 assessment is finalised.

## Immutability
Each finalised triage assessment receives an increasing assessment version. Historical assessments are not overwritten; reassessment creates another version.

## Explicit non-goals
- No duplicate matching.
- No follow-up matching to an existing case.
- No Intake disposition to external safety DB.
- No case creation.
- No MedDRA/WHODrug dependency.
- No autonomous regulatory submission.
- No regulatory deadline engine.

## Exit criteria
- Formal triage requires Source Review = VERIFIED.
- Four human-confirmed minimum criteria are stored.
- Seriousness criteria and special situations are stored.
- Follow-up need/reasons are stored.
- System recommendation and human decision are both preserved.
- Triage outcome is consistency-derived.
- Valid cases route to DUPLICATE_REVIEW for Sprint 6.
- TRIAGE review task is completed only on formal finalisation.
- Migration 025 and Sprint 5 verification pass.
