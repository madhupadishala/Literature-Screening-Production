# Causality Agent integration

This directory is the Nexus integration boundary for the shared **Causality Agent**.

## Current design

Causality is assessed per **drug-event pair**. The service uses an explicit orchestrated flow:

1. pair formation
2. chronology
3. evidence extraction
4. temporal/clinical evidence
5. governed knowledge retrieval
6. alternative etiology
7. dechallenge/rechallenge
8. configured causality method
9. regulatory grounding
10. conflict/quality gate
11. rationale synthesis
12. routing and immutable audit

The decision-support service is fail-safe: unknown evidence remains unknown; retrieval failure is not interpreted as absence; Certain, Unlikely, Conditional and Unassessable remain human-review outcomes.

## Nexus Knowledge Base

`nexus_kb_adapter.py` bridges the causality service to the existing `backend.knowledge.knowledge_router.KnowledgeRouter` instead of creating a second production knowledge owner.

The existing router therefore remains responsible for tenant filtering, Client Product Master lookup, governed rule retrieval, and source citations. The causality service consumes that context and records the retrieval version/snapshot in its assessment audit.

## Release state

Automatic causality release must remain disabled until all required release gates pass, including qualified medical/PV rule approval, real expert-labelled benchmark, end-to-end regression, knowledge snapshot qualification, tenant-isolation/security testing, and CSV/GxP approval.

The standalone causality qualification package contains the full rule engine, orchestration, blind benchmark tools, regression tests, URS/FRS traceability and validation-evidence drafts.
