# ClinixAI Pharmaceutical Product Intelligence Knowledge v1.0

Status: Approved for implementation
Approved: 2026-07-22
Scope: Literature suspect-product identification, Product Master matching, product-presentation interpretation, COI/licence confirmation, and special-situation separation.

This repository does not reduce pharmaceutical product identification to one prompt statement. Each approved scenario is represented as governed knowledge, machine-readable decision data, prohibited conclusions, manual-review conditions, and executable validation fixtures.

The approved machine-readable registry is `frontend/lib/pharmaceutical-intelligence/approved-scenarios.json`. This directory provides its controlled repository manifest, schema, scope, and approval record. The governance verifier validates the operational registry against these controls.

## Approved scenarios

- PPI-SCN-001 — INN, generic, common, and chemical-name equivalence
- PPI-SCN-002 — Common salt normalization with preservation
- PPI-SCN-003 — Composition-specific handling of ambiguous product families
- PPI-SCN-004 — Product formulation/presentation matching
- PPI-SCN-005 — Administration route as use circumstance and special-situation evidence
- PPI-SCN-006 — COI and date-effective licence confirmation

## Core control

The LLM may extract evidence and resolve narrative ambiguity. It must not invent pharmaceutical equivalence, Product Master ownership, COI, licence status, or effective dates. Deterministic assessment and audit controls enforce the approved scenarios.
