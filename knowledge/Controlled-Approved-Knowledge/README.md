# Controlled Approved Knowledge

This is the **team-approved decision knowledge layer**.

It contains approved guidance, operational logic, deterministic rules, decision policies, mappings created/approved by the PV/QA team.

## It may contain

- inclusion/exclusion rules;
- ICSR validity logic;
- product-role rules;
- drug-event/causality logic;
- seriousness logic;
- special-situation rules;
- Day-0 logic;
- duplicate logic;
- listedness/expectedness policies;
- aggregate-safety routing;
- signal-relevance routing;
- client-independent cross-engine policies;
- approved decision trees;

## It must not contain

- raw external regulation PDFs;
- raw SOP binaries;
- uncontrolled AI summaries;
- draft rules;
- prompt text masquerading as policy;
- model-generated conclusions without human approval.

## Relationship to source documents

Every approved Knowledge Object must cite one or more source documents and sections. The Knowledge Object is the operational rule; the source remains the authoritative evidence.

## Runtime use

Mandatory Knowledge Object IDs are loaded first. Approved decision scenarios may then be retrieved from the separate `knowledge/Scenarios/` layer as precedents/examples. Hybrid vector/keyword retrieval and Agentic RAG may add supporting context but may not omit or override mandatory rules.
