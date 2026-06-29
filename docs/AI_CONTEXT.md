# ClinixAI Nexus — AI Context

ClinixAI Nexus is a modular pharmacovigilance platform.

This repository is intentionally designed so an LLM can understand the architecture, decision pattern, and contribution rules without relying on chat history.

## Product Vision

ClinixAI Nexus is intended to support pharmacovigilance workflows including:

- Literature screening
- MICC
- ICSR intake
- Case processing
- Regulatory intelligence
- Signal management
- QMS
- Training
- Knowledge management

The current application is Literature Screening Enterprise MVP.

## Architecture Rule

Do not place business logic inside Streamlit pages.

Correct flow:

UI Page
→ Service
→ Engine
→ Provider / Database / Knowledge
→ Response
→ Audit

## Folder Responsibilities

- `platform/`: reusable runtime services such as kernel, router, state, auth, audit, workflow, styles.
- `components/`: reusable UI components.
- `apps/literature/pages/`: Literature-specific Streamlit pages.
- `services/`: orchestration layer.
- `engines/`: pharmacovigilance business decision logic.
- `providers/`: external source integrations such as PubMed, Europe PMC, ClinicalTrials.gov.
- `models/`: Python data models.
- `schemas/`: business data contracts.
- `rules/`: executable decision rules.
- `knowledge/`: SOPs, product rules, client rules, regulatory documents.
- `docs/`: architecture, decisions, roadmap, AI handoff context.

## Contribution Rules

1. Keep pages thin.
2. Put reusable UI in `components/`.
3. Put shared runtime logic in `platform/`.
4. Put business decision logic in `engines/`.
5. Put external API logic in `providers/`.
6. Every important decision must be added to `docs/DECISIONS.md`.
7. Every new engine must have clear input, output, and responsibility.
8. Every AI decision must provide decision, confidence, rationale, evidence, and rules used.

## Current Build Focus

Build the platform runtime first:

1. Platform kernel
2. Router
3. Styles
4. State
5. Header
6. Navigation
7. Workspace
8. Knowledge panel
9. Literature Dashboard
10. Hits/Search capability
11. Screening capability

## Decision Philosophy

ClinixAI should be designed like an enterprise pharmacovigilance platform, not a simple Streamlit prototype.

The system must be:

- modular
- auditable
- GxP-aware
- multi-tenant ready
- AI-assisted but rule-validated
- easy to migrate later to FastAPI + Next.js
