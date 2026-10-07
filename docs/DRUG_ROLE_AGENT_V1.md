# Nexus Drug Role Classification Agent v1

Purpose: extract all medicinal products from an ICSR and classify each product along two independent dimensions.

Clinical role: SUSPECT, CONCOMITANT, HISTORICAL, TREATMENT, UNKNOWN.

Ownership: COMPANY, NON_COMPANY, UNKNOWN.

Governance:
- Controlled tenant Product Master data is authoritative for company ownership.
- A product missing from Product Master remains ownership UNKNOWN; it is not automatically non-company.
- Explicit case evidence outranks inference.
- Ambiguous or conflicting results require human review.
- Upstream drug NER or validated terminology candidates are preferred. Regex discovery is fallback behavior.
- Evidence spans, confidence, rationale, and Product Master matches are retained.

Pipeline:
ICSR text -> drug mention extraction -> normalization -> context evidence -> role classification -> ownership resolution -> review gate -> structured result.

Nexus integration:
- Core engine: backend.agents.drug_role.DrugRoleOrchestrator
- Nexus wrapper: backend.agents.drug_role.nexus_agent.NexusDrugRoleAgent
- Knowledge integration: backend.knowledge.knowledge_router.KnowledgeRouter

Next validation increment:
1. connect validated drug terminology resolution;
2. add source-specific branches for literature, clinical trials, spontaneous reports and solicited reports;
3. add model-backed verifier only for unresolved or conflicting classifications;
4. persist agent evidence and audit events;
5. run a curated gold-standard ICSR regression set before enabling automatic acceptance.
