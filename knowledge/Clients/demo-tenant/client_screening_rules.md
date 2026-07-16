---
rule_id: TENANT-DEMO-LIT-VALIDITY-OVERRIDE
domain: validity
module: literature_screening
knowledge_type: tenant_override
priority: critical
effective_date: 2026-07-04
source_document: TEN-DEMO-WI-012
source_section: 1.2
version: 1.0.0
agent_scope: ["screening_agent"]
country_scope: ["GLOBAL"]
product_scope: ["PROD-002"]
override_level: 1
---
For product VaxGuard, if the adverse event is a Special Situation, the case must be marked valid.