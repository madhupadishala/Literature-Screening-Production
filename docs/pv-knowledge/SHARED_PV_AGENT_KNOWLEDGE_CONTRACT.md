# Nexus Shared PV Agent Knowledge Contract v1
Status: DRAFT — architectural requirement, NOT approved clinical knowledge.
Owner: Nexus Knowledge Governance; approval: PV/Medical + QA/CSV.
Applies to all current and future Nexus safety agents.

## Non-negotiable boundary
There is ONE governed Nexus Knowledge Base. Agents are consumers of versioned knowledge packs, not owners of private clinical rulebooks. Domain extraction, schema enforcement, and orchestration remain in code; regulated interpretation, dictionaries, client policy and decision tables are Knowledge Base resources. No dynamic web search may silently change active production decisions.

## Required knowledge classes
1. AUTHORITATIVE_REGULATORY: versioned original official source, jurisdiction, applicability, status and effective date.
2. CONTROLLED_INTERNAL_INTERPRETATION: PV/QA approved interpretations, SOPs, decision tables, exception handling.
3. CLIENT_CONTROLLED: Product Master, MAH roles, label/RSI, client SOP, country applicability. Never cross tenant/client boundaries.
4. LICENSED_TERMINOLOGY: allowed licensed vocabulary and its version; licensing/access verified.
5. REFERENCE_RESEARCH: scientific papers and examples, explicitly non-authoritative.
6. VALIDATION_REFERENCES: source-disjoint, expert-adjudicated locked test sets; NEVER exposed to agents during inference.

## First-class topic packs (not private agent knowledge)
- PV-DUP-LIT: identifiers, preprint/final, bibliographic vs case/patient overlap, full-text provenance.
- PV-DUP-ICSR: WWUID and case identifiers, patient/event/product/time match, conflicts, master-case and follow-up decisions.
- PV-FOLLOWUP: missing-data question priority, non-leading wording, previous requests, materiality, consent/privacy.
- PV-LIT-SCREEN: patient vs aggregate safety, reportability vs relevance, inclusion/exclusion reason codes, title/abstract/full text.
- PV-ACTION: G.k.8 code rules, linkage to specific products and events, chronology and reason-for-change.
- PV-DECHALLENGE: withdrawal/reduction, clinical course, latency, concurrent interventions, confounders.
- PV-RECHALLENGE: re-administration evidence, recurrence/non-recurrence, alternate causes, contradictory observations.
- PV-HISTORY: patient/family distinction, historical/current conditions, indication vs event, CAP dictionary pending approval.
- PV-CROSS-CUTTING: adverse event, suspect product, seriousness, causality, listedness, COI, special situations, chronology, patient attribution and evidence policies.

## Knowledge object mandatory metadata
id, topic_pack, source_class, title, source_url, authority, source_document_id, exact_section, jurisdiction, publication_date, effective_from, effective_to, status, version, checksum_sha256, parent_or_superseded_id, clinical_owner, qa_approver, approval_date, applicable_tenants_clients, required_dependency_ids, test_case_ids.
States: DRAFT -> REVIEWED -> APPROVED -> RETIRED/SUPERSEDED. Initial imported regulatory metadata is NEVER auto-approved.

## Knowledge resolution contract
resolveKnowledge({tenantId,clientId,agentId,workflowId,jurisdiction,productId,asOf,requiredRuleIds})
must:
- authenticate request and enforce scope at every retrieval hop;
- resolve mandatory approved exact IDs BEFORE optional hybrid lexical/vector search;
- verify effective date, source classification, dependencies, licensing and client applicability;
- return immutable pack version, source references, missing IDs, conflicts and hash;
- fail closed to UNRESOLVED / HUMAN_REVIEW_REQUIRED when mandatory rules are missing, conflicting, superseded or unauthorised;
- never let model weights or cached snippets replace approved source text.

All execution logs must record knowledge pack ID/version/hash, rule IDs, model/prompt/tool versions, source evidence and reviewer action. The engine must not claim rule approval merely from a local status label.

## Regulatory source candidates — REQUIRE SECTION REVIEW BEFORE PROMOTION
- EMA GVP Module VI Rev 2 (effective 2017-11-22): https://www.ema.europa.eu/en/documents/regulatory-procedural-guideline/guideline-good-pharmacovigilance-practices-gvp-module-vi-collection-management-submission-reports-suspected-adverse-reactions-medicinal-products-rev-2_en.pdf
- EMA GVP Module VI Addendum I (effective 2017-11-22): https://www.ema.europa.eu/en/documents/regulatory-procedural-guideline/guideline-good-pharmacovigilance-practices-gvp-module-vi-addendum-i-duplicate-management-suspected-adverse-reaction-reports_en.pdf
- ICH E2B(R3) implementation guide (2025 step 3 document; confirm latest approved final package): https://database.ich.org/sites/default/files/ICH_E2B%28R3%29_EWG_IWG_ICSR_Implementation_Guide_%28QA%20integration%29_Step3_2025_0718_Assembly_Approved_0.pdf
- ICH E2D(R1): verify latest Step 4 / regional implementation before formal release.

## Change process
Regulatory watch -> capture source/version/checksum -> proposed rule update -> traceable impact analysis -> PV medical review -> QA approval -> new immutable pack version -> targeted regression + blinded evaluation -> staged deployment -> controlled promotion. Rollback must retain last approved pack.

## Mandatory agent tests
1. Missing rule gives unresolved (never automatic negative).
2. Wrong client/product or expired rules are denied.
3. Draft research cannot override approved regulator/internal rules.
4. Required exact IDs are returned even if semantic top-K omits them.
5. Conflicting source rules result in review.
6. Historical case replay uses knowledge version effective at assessed time.
7. Cross-agent assessment uses same pinned pack snapshot.
8. Knowledge pack promotion emits impacted-agent test requirements.

## Exit criterion
Each agent release has a topic-pack coverage matrix; every critical decision path maps to an approved knowledge object, executable regression, case evidence and human owner. If not, mark NOT KNOWLEDGE-QUALIFIED and keep agent review-only.
