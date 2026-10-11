# Nexus B2 — five-agent canonical migration

**Status:** Upload staging / NOT yet merged or deployed.

Canonical destination: `backend/shared_agents/vendor/b2_5/`; retain core, schemas, rules, API, tests and knowledge documents together.

New candidate agents:
- Clinical Narrative (`narrative.py`)
- Pregnancy / Special Situations (`special_situations.py`)
- Indication Extraction (`indication.py`)
- Event Outcome (`event_outcome.py`)
- Regulatory Clock (`regulatory_clock.py`)

Source: supplied `nexus_b2_shared_layer_ready.zip` with 25 files, including revised registry and regression tests. This branch currently contains only this receipt, **not** the B2 source tree. Preserve the existing 13 specialist agents and eight legacy components; no clinical routing, deployment, or runtime activation is authorized.

Migration will be complete only after all source files are committed, 18 specialist paths resolve in `source_inventory()`, imports and tests pass in CI and a review is performed for overlap between day-zero and regulatory clock agents.
