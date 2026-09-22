# Nexus Sprint 2 — Common Safety Data Backbone

## Objective
Create the shared regulated safety data layer used by Nexus Intake, Case Processing, Medical Review, and later Signal/Aggregate modules without duplicating Literature data structures.

## Architectural rules
1. Literature is an upstream safety source, not the case database.
2. Intake records are source-preserving and idempotent.
3. Patient records are case/intake-scoped; the platform does not infer a global patient identity across cases.
4. Case versions are immutable snapshots with deterministic SHA-256 hashes.
5. E2B(R3) regulatory sections are explicit in the internal case payload:
   - C — case identification, primary sources, sender/literature/study context
   - D — patient characteristics
   - E — reactions/events
   - F — tests/procedures
   - G — drugs/products
   - H — narrative/further information
6. Workflow state, assignment and review tasks stay outside the immutable E2B payload.
7. Evidence is linked by lineage instead of copied without traceability.
8. The common safety layer is tenant-isolated and environment access remains enforced by Sprint 1.

## Core entities
- SafetySource
- IntakeRecord
- Patient
- Reporter
- Product
- Event
- Test
- Case
- CaseVersion
- ProductEventAssessment
- ReviewTask
- EvidenceLink

## Literature integration
A governed Literature `intake_input_export` is mapped into the common safety model through a deterministic adapter. The original Literature export remains immutable and receives only a nullable link to the downstream Intake record.

## Sprint 2 exit criteria
- Migration 023 defines the common safety relational backbone.
- Literature handoff can be normalized into a validated common Intake draft.
- Intake persistence is idempotent for the same governed Literature export.
- Case version snapshots support ICH E2B(R3)-aware C/D/E/F/G/H sections.
- Source lineage and evidence linkage are preserved.
- Intake/Case records remain tenant-isolated.
- Verification tests cover mapping, validation, deterministic hashing and case-version rules.
- Existing Literature and Sprint 1 verification suites remain green.

## Implementation candidate
This branch contains the complete Sprint 2 candidate for CI verification. Production release remains gated behind controlled application of scheduled-search migration 021 followed by Nexus migrations 022 and 023; no schema migration is executed by CI.
