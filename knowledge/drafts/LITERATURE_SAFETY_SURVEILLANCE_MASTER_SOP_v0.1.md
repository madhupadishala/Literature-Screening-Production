# Literature Safety Surveillance and Assessment Master SOP
Status: DRAFT FOR GOVERNANCE / NOT PRODUCTION-EFFECTIVE
Version: 0.1.0
Purpose: End-to-end literature surveillance, safety assessment, ICSR routing, aggregate-safety routing and governed AI decision support.

## 1. Governing principle

Every material Literature/PV decision shall be made from a controlled Decision Knowledge Pack. No decision engine may rely only on an LLM prompt, vector similarity result, model memory, or an unconstrained top-K RAG result.

Each Decision Knowledge Pack shall contain:
1. the effective tenant/client SOP and contractual rules applicable to the decision;
2. the mandatory sections of this Master SOP;
3. the exact applicable GVP/EMA regulatory rules and definitions;
4. applicable Product Master, MAH/lifecycle, label and safety-agreement data;
5. the source article evidence needed for the decision;
6. the versions/hashes of all governed sources used.

If a mandatory source is unavailable, conflicting, superseded, or not effective, the engine shall not finalise the regulated decision. It shall return a controlled unresolved/manual-review state.

## 2. Source hierarchy

The following hierarchy governs decision-making, subject to jurisdiction and contract:
1. Applicable law/regulation and effective regulatory guidance.
2. Client/MAH approved SOP, safety agreement, SOW and jurisdiction-specific requirement where more specific and compliant.
3. This Master SOP and approved internal work instructions.
4. Approved Product Master, MAH/lifecycle, label/reference safety information and controlled dictionaries.
5. Approved medical/regulatory knowledge objects.
6. AI interpretation of unstructured evidence.

AI interpretation may clarify evidence but shall not create, weaken or override a controlled rule.

## 3. Core regulatory sources

Mandatory or conditionally applicable sources include:
- GVP Module I — Pharmacovigilance systems and their quality systems.
- GVP Module VI Rev. 2 — Collection, management and submission of reports of suspected adverse reactions.
- GVP Module VI Addendum I — Duplicate management of suspected adverse reaction reports.
- GVP Module VI Addendum II — Masking of personal data in ICSRs submitted to EudraVigilance.
- GVP Module VII Rev. 1 — Periodic safety update report.
- GVP Module VIII Rev. 3 — Post-authorisation safety studies, when study/PASS literature is in scope.
- GVP Module IX Rev. 1 — Signal management.
- GVP Annex I Rev. 5 — Definitions.
- Applicable ICH E2B/E2D/E2C and MedDRA/IME references where invoked by GVP or the configured client process.

The controlled knowledge repository shall store regulatory section references and operationalised rules; it shall not depend on live web retrieval during regulated execution.

## 4. Scope

This SOP covers:
- global and local literature search setup;
- scheduled/manual search execution;
- HIT generation and article identity;
- article deduplication;
- title/abstract/full-text evidence handling;
- full-text acquisition and translation;
- document parsing/OCR/IDP;
- publication classification;
- product identification and Product Master matching;
- Safety Assessment;
- special-situation assessment;
- drug-event/product-role assessment;
- patient segmentation;
- ICSR minimum criteria;
- seriousness and medical evidence;
- duplicate case assessment;
- Medical Review;
- Intake/Triage/L2A handoff;
- aggregate safety and signal routing;
- follow-up, Day 0, audit and quality review;
- AI/automation governance.

## 5. Roles

### 5.1 Literature Monitoring Associate / automated search service
Executes approved searches, verifies search outputs, initiates full-text/translation requests, and maintains evidence.

### 5.2 Quality Reviewer / Medical Reviewer
Reviews safety relevance, inclusion/exclusion, difficult causality/product-role questions, unresolved evidence and regulated recommendations.

### 5.3 PV Physician / SME
Resolves complex medical interpretation, causality, diagnosis and follow-up questions when configured.

### 5.4 Quality Assurance
Owns SOP governance, change control, validation evidence and compliance oversight.

### 5.5 System/AI services
May search, extract, classify, correlate and recommend only within approved knowledge and deterministic controls. Human authority and configured approval requirements remain unchanged.

## 6. Literature search setup

Before production search:
1. resolve tenant/client, product and jurisdiction;
2. confirm active Product/Search Profile;
3. confirm Brand, Generic, API/INN, salts, synonyms and abbreviations;
4. confirm approved databases, local journals, search frequency and date range;
5. confirm safety concept set and client-specific terms;
6. validate the database-specific query;
7. retain the approved search version and evidence package.

Search design shall favour recall over premature exclusion. Search generation is a retrieval process and shall not itself make a regulatory include/exclude decision.

## 7. Search execution and HIT generation

Every scheduled or authorised manual execution shall produce an auditable search record even when zero HITs are returned.

Every retrieved record shall enter the HIT queue before regulated screening. The system shall:
- preserve PMID/DOI/database accession identifiers;
- assign an internal Article ID;
- retain source/database and retrieval timestamp;
- consolidate duplicates without deleting source lineage;
- preserve title, abstract, indexing terms and available full text.

## 8. Evidence-availability classification

Every article shall be classified as:
- TITLE_ONLY;
- ABSTRACT_ONLY;
- FULL_TEXT.

Explicit evidence present at title/abstract level shall be retained and may trigger full-text acquisition or review. Lack of retrieved full text shall never be treated as evidence that safety information is absent.

Where full text is required for a material decision, the article shall remain pending until acquired or an authorised alternative disposition is recorded.

## 9. Full-text and document intelligence

The original publication is the source of truth.

For PDF/XML/HTML/scanned publications:
1. preserve the immutable source document/hash;
2. parse machine-readable text when available;
3. use OCR only when required;
4. use IDP/layout extraction to preserve page, section, paragraph, table, figure, caption and reference location;
5. preserve original language and any governed translation;
6. maintain evidence coordinates so every AI output can be traced back to the source.

Long articles shall not be truncated for screening. Technical chunking may be used for processing, but final regulated reasoning must be able to reconstruct cross-section relationships from original evidence.

## 10. Publication classification

Classify publication type, including:
- case report;
- case series;
- clinical trial;
- observational study;
- cohort/database/registry study;
- systematic review/meta-analysis/review;
- conference abstract;
- letter/editorial;
- animal/in-vitro/non-human publication;
- other configured types.

Publication type informs routing but shall not independently determine inclusion/exclusion.

## 11. Product identification and role assessment

Identify all medicinal products/substances in the article and normalise them against Product Master.

For every product, maintain an independent role:
- SUSPECT;
- CO_SUSPECT;
- INTERACTING;
- CONCOMITANT;
- COMBINATION_INGREDIENT;
- TREATMENT;
- EXPOSURE;
- OVERDOSE/POISONING_INGESTION;
- DISCUSSION_ONLY;
- UNRESOLVED.

Co-occurrence of a product and an event shall not establish a causal relationship.

For literature with multiple products, the assessment shall give high weight to the authors' explicit or clearly supported attribution. A company ingredient shall not inherit causality merely because it is part of a combination product.

## 12. Safety Assessment Engine

The first regulated assessment question is:

"Does the available publication evidence contain patient-level safety information, aggregate safety information, a special situation, or a potentially important safety finding requiring deeper review?"

Permitted outputs:
- CASE_SAFETY;
- AGGREGATE_SAFETY;
- BOTH;
- NO_SAFETY_SUPPORTED;
- UNRESOLVED.

### 12.1 CASE_SAFETY
Requires patient-level evidence consistent with the applicable ICSR/safety-information rules.

### 12.2 AGGREGATE_SAFETY
May exist without an individually identifiable valid ICSR, for example in studies, reviews, pooled analyses, registries or database analyses reporting clinically relevant risk information.

### 12.3 NO_SAFETY_SUPPORTED
May be finalised only when the available evidence has been adequately assessed and a controlled exclusion rationale exists. "Nothing retrieved" is not a valid exclusion rationale.

### 12.4 UNRESOLVED
Used when full text, relationship evidence, source identity, product role or other mandatory information is insufficient/conflicting.

## 13. Drug-event relationship and causality evidence

For every potential product-event relationship, evaluate:
- author's explicit causality wording;
- temporal relationship/time to onset;
- dose increase/decrease and dose-response;
- dechallenge;
- rechallenge;
- alternative causes/underlying disease;
- concomitant and interacting products;
- indication and disease progression;
- biologic/pharmacologic plausibility where an approved reference exists;
- contradictory evidence;
- final diagnosis versus presenting symptoms.

The engine shall distinguish:
- source fact;
- contextual relationship supported by multiple source passages;
- model inference.

Model inference shall never be silently stored as source fact.

## 14. Special situations

Assess special situations independently from ADR causality, including when configured:
- pregnancy exposure;
- breastfeeding exposure;
- overdose;
- intentional overdose/poisoning;
- accidental overdose;
- misuse;
- abuse;
- medication error;
- off-label use;
- occupational exposure;
- lack of therapeutic efficacy;
- drug interaction;
- paediatric/elderly exposure where specifically relevant;
- quality defect/falsified medicinal product;
- infectious-agent transmission concern;
- other configured special situations.

Presence of a special situation does not automatically establish an adverse reaction. It may still require collection, aggregate evaluation, risk-management consideration or a client-specific workflow.

## 15. Patient segmentation

A publication may describe zero, one or multiple patients.

When multiple identifiable patients are described:
- maintain one Article/Review Workspace;
- create separate patient evidence groups;
- assess minimum criteria per patient;
- create separate downstream ICSRs/cases as required;
- retain cross-reference to the common literature article.

## 16. ICSR minimum validation

A potential ICSR shall be assessed for at least:
- identifiable reporter/primary source;
- identifiable patient;
- suspected adverse reaction;
- suspect medicinal product.

Client-validity logic may additionally require active MAH/product ownership and jurisdiction-specific conditions.

Missing information shall be represented as Unknown/Not Available, not invented.

## 17. Reporter and source handling

For literature cases, preserve the publication citation and authors.

The first publication author, or the corresponding author when designated according to the applicable process, may serve as the primary source. Source country, patient/event country and author affiliation shall remain separate concepts.

## 18. Country handling

The system shall maintain separate fields for:
- patient/event country;
- primary source country;
- author affiliation country;
- publication/journal country;
- MAH/product authorisation country.

No engine shall collapse these into a single country field. Any configured Country of Incidence rule must explicitly identify its source hierarchy and regulatory/client basis.

## 19. Seriousness and medical assessment

Assess seriousness using the applicable regulatory criteria and evidence. Death shall not automatically make an event fatal when the source supports an unrelated cause such as disease progression.

Preserve:
- seriousness criteria;
- event outcome;
- hospitalisation;
- medically important condition;
- death details;
- diagnosis;
- relevant tests/labs;
- medical history and alternative etiologies.

## 20. Listedness/expectedness

Where required by the configured workflow, listedness/expectedness shall be assessed against the effective approved reference safety information for the correct product, jurisdiction and version. The result shall store the source document/version used.

## 21. Inclusion/exclusion decision

The Screening decision shall not be a single free-text model judgement.

The decision shall show:
- evidence level;
- publication type;
- products and roles;
- safety relevance;
- patient-level validity;
- special situations;
- product-event relationship;
- seriousness where relevant;
- active MAH/product ownership;
- applicable inclusion/exclusion rules;
- unresolved/conflicting evidence;
- source citations and rule versions.

Any exclusion must carry a specific controlled rationale.

## 22. Medical Review

Medical Review shall receive the complete evidence package and may:
- confirm;
- return for clarification;
- override with reason;
- mark unresolved;
- approve for Intake;
- route to aggregate/signal workflow where no patient-level ICSR is created.

The original machine recommendation shall remain immutable.

## 23. Day 0 and awareness

Day 0 shall be determined according to the effective regulatory/client rule for the type of literature report and awareness event. The system shall record:
- awareness timestamp;
- awareness actor/source;
- article availability level;
- minimum criteria status at awareness;
- subsequent full-text/translation receipt dates;
- any recalculation permitted by the applicable rule.

## 24. Duplicate management

Before creating a new case:
- compare against existing literature and non-literature cases;
- use article identifiers, patient characteristics, reporter/source, product, event, dates and narrative evidence;
- preserve potential-duplicate evidence;
- require the configured human confirmation where mandated;
- link/merge according to the approved duplicate-management process.

## 25. Intake/Triage/L2A handoff

For an approved patient-level case:
1. generate an immutable Literature-to-Intake evidence package;
2. create/import Intake;
3. confirm source review;
4. evaluate minimum criteria;
5. perform duplicate search;
6. classify new/duplicate/follow-up;
7. create governed L2A/case shell when authorised;
8. retain article, evidence coordinates and screening/MR decisions as source provenance.

## 26. Aggregate and signal routing

A publication may be non-ICSR but still safety-relevant.

Aggregate/signal routing shall be triggered when literature:
- reports pooled or population-level risks;
- provides new frequency/severity information;
- reports a new or changed safety concern;
- contributes to an emerging safety issue;
- provides study/review/meta-analysis evidence;
- informs PSUR/PBRER evaluation;
- contributes to signal validation/evaluation.

These outputs shall remain distinct from patient-level ICSR validity.

## 27. Follow-up

Where important information is missing, follow-up may be initiated according to the configured risk-based/client process. The system shall preserve:
- follow-up question;
- reason;
- recipient/source;
- date sent;
- response;
- changed case elements;
- changed seriousness/causality/validity states.

## 28. Quality and human oversight

Every automated result shall be reviewable and reconstructable.

Quality controls shall include:
- training/qualification;
- approved SOP/rule versions;
- validation;
- audit trail;
- exception handling;
- change control;
- periodic performance review;
- false-negative monitoring;
- reviewer override monitoring;
- CAPA where required.

## 29. AI and Agentic RAG controls

AI may:
- parse and classify documents;
- extract evidence;
- link cross-section evidence;
- retrieve applicable controlled rules;
- identify contradictions/gaps;
- generate bounded recommendations.

AI shall not:
- truncate away unreviewed source evidence as a decision shortcut;
- infer missing minimum ICSR criteria;
- turn co-occurrence into causality;
- substitute top-K similarity for mandatory rules;
- silently ignore contradictory evidence;
- finalise a decision when required governed sources are unavailable.

Agentic RAG shall be used to retrieve and re-check original evidence and supporting controlled knowledge. The article remains the primary evidence source; RAG is a navigation/reasoning aid, not a replacement for the source.

## 30. Decision Knowledge Pack

Before any regulated engine decision, the Knowledge Policy Resolver shall return:
- decision type;
- tenant/client/product/jurisdiction;
- mandatory Master SOP rule IDs;
- mandatory regulatory section IDs;
- client/SOW/SOP rules;
- Product Master/MAH/label references;
- retrieved article evidence references;
- optional supporting knowledge;
- rule/source versions and hashes;
- conflicts/missing mandatory sources.

The decision engine shall reject finalisation when the pack is incomplete.

## 31. Audit record

Every decision shall record:
- actor/service;
- timestamp;
- decision type and outcome;
- article/case identifiers;
- evidence references;
- mandatory rule IDs;
- regulatory section references;
- product/label/master-data versions;
- model/provider/version if AI contributed;
- prompt/context-pack hash where applicable;
- reviewer confirmation/override;
- reason for override;
- prior and final state.

## 32. Validation and golden cases

Release testing shall include:
- obvious positive case;
- obvious negative article;
- multi-drug case;
- combination-product causality case;
- alternative-cause case;
- dose increase/misuse case;
- intentional overdose/suicide attempt;
- title-only safety evidence;
- abstract-only ambiguous case;
- long full-text case;
- multi-patient publication;
- observational/aggregate safety study;
- review/meta-analysis safety signal;
- pregnancy/breastfeeding;
- medication error;
- lack of efficacy;
- duplicate literature/non-literature case;
- contradictory evidence;
- missing full text/translation;
- tenant-specific rule conflict.

False-negative safety exclusions shall be treated as a critical validation metric.

## 33. Regulatory mapping — core sections for Literature/PV decisions

### GVP Module VI
Key controlled references include:
- VI.A. terminology/definitions;
- VI.B.1.1.2 Literature reports;
- VI.B.2 Validation of reports;
- VI.B.3 Follow-up;
- VI.B.5 Quality management;
- VI.B.6 Special situations;
- VI.C.2.2.3 Case reports published in medical literature;
- VI.C.2.2.3.2 literature ICSR exclusion criteria;
- VI.C.6.2.2.2 suspect/interacting/concomitant medicinal products;
- VI.C.6.2.2.3 suspected adverse reactions;
- VI.C.6.2.2.4 narrative/comments/causality;
- VI.C.6.2.3 special-situation handling;
- VI.C.6.2.4 data quality and duplicate management;
- VI.App.2 detailed literature-monitoring guidance.

A critical literature rule is that where multiple medicinal products are mentioned, product consideration must follow the publication authors' attribution of at least a possible causal relationship rather than simple co-occurrence.

### GVP Module VII
Use for literature contributing to cumulative/interval safety evaluation, PSUR/PBRER and benefit-risk assessment, including relevant non-ICSR safety evidence.

### GVP Module IX
Use for scientific literature contributing to signal detection, validation, confirmation, analysis and prioritisation.

### GVP Module I
Use for quality-system, procedure, training, compliance, records, validation and continuous-improvement controls.

### GVP Module VI Addendum I
Use for duplicate-detection and duplicate-management controls.

### GVP Module VI Addendum II
Use for masking/pseudonymisation of applicable ICSR personal data.

### GVP Annex I
Use the effective definitions as the terminology authority.

## 34. Change control

Any change to a rule that may affect a regulatory decision shall require:
- impact assessment;
- source/reference review;
- PV SME review;
- QA approval;
- version increment;
- regression/golden-case testing;
- effective date;
- controlled deployment.

Historical decisions shall retain the exact rule/source versions effective at the time.

## 35. Current draft limitations

This draft incorporates the uploaded Literature Search SOP and public GVP requirements but is not yet a final company-controlled SOP. Internal downstream source documents referenced by the uploaded SOP (e.g. ICSR Handling and Processing and Triage work instructions) should be incorporated when available to reconcile organisation-specific case-processing responsibilities, timelines and approval roles.

Until then, the regulatory principles above may support the draft knowledge model but shall not be represented as replacing an approved internal procedure.
