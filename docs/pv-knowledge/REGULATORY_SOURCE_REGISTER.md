# Sprint 1 — Controlled Pharmacovigilance Regulatory Source Register

Document ID: PV-KNOWLEDGE-REGISTER-001
Status: Active baseline
Purpose: define the authoritative source universe used to derive PV requirements, test cases, decision tables and controlled retrieval knowledge.

## Core rule

No regulated PV requirement may be created from model memory alone when an authoritative source is available.

Every implemented rule must record:
- authority
- jurisdiction
- document/guideline title
- revision/version
- publication/effective date where available
- section/requirement
- applicability
- interpretation owner/status
- linked URS/FRS/test IDs

## Tier A — Harmonised / supranational primary sources

### ICH
Include applicable current versions and implementation material for:
- E2A — Clinical Safety Data Management
- E2B(R3) — Electronic Transmission of Individual Case Safety Reports
- E2C(R2) — Periodic Benefit-Risk Evaluation Report
- E2D(R1) — Post-Approval Safety Data: Definitions and Standards for Management and Reporting of ICSRs
- E2E — Pharmacovigilance Planning
- E2F — Development Safety Update Report
- applicable E2B(R3) implementation guides, Q&As, code lists and schema/validation packages
- other ICH safety/data standards when they materially affect a module

### WHO / UMC-related authoritative guidance
Include applicable WHO PV guidance and current strategy material for:
- pharmacovigilance systems and operations
- safety monitoring
- medication-error reporting
- risk management
- vaccine safety where applicable
- global smart pharmacovigilance strategy
- WHO RMP assessment tools
- ACSoMP/GACVS recommendations when relevant to platform capability

WHO/UMC material is treated according to its normative status; it is not automatically equivalent to binding jurisdictional law.

## Tier B — European Union / EEA

### EMA GVP
Track all applicable current GVP modules, annexes, addenda and product/population-specific considerations.

Core module coverage:
- Module I — PV systems and quality systems
- Module II — PSMF
- Module III — PV inspections
- Module IV — PV audits
- Module V — risk management systems
- Module VI — collection, management and submission of suspected ADR reports
- Module VI Addendum I — duplicate management
- Module VI Addendum II — masking personal data in ICSRs
- Module VII — PSUR
- Module VIII — PASS
- Module IX — signal management
- Module X — additional monitoring
- Module XV — safety communication
- Module XVI — risk minimisation measures
- Annex I — definitions
- Annex II — templates
- current product/population-specific considerations

Also track:
- EudraVigilance ICSR/E2B implementation material
- EU implementation strategies for newly adopted ICH guidance
- EMA procedural Q&As and technical specifications where they alter system behavior

## Tier C — India

### CDSCO / PvPI / IPC / applicable Indian law
Include:
- Pharmacovigilance Guidance Document for Marketing Authorization Holders of Pharmaceutical Products, current version
- Guidance for Industry on Pharmacovigilance Requirements for Human Vaccines, current version
- current PSUR submission requirements and SUGAM manuals
- Schedule M PV system requirements and related CDSCO implementation communications
- applicable NDCT Rules 2019 requirements
- PvPI/IPC operational and reporting material when applicable
- Indian ICSR, literature, PSUR, signal, QMS, inspection and MAH obligations relevant to platform modules

India is a primary deployment/regulatory context and receives explicit jurisdictional test scenarios.

## Tier D — United States

### FDA
Include current applicable:
- postmarketing adverse event reporting requirements and compliance program material
- 21 CFR-related requirements used by FDA for postmarketing reporting
- E2D(R1) final guidance
- FDA AEMS/FAERS electronic submission guidance
- E2B(R2)/E2B(R3) implementation material during transition
- regional implementation guides
- core/regional E2B(R3) data elements and business rules
- electronic submission technical conformance material
- PBRER/periodic reporting guidance where applicable
- vaccine/biologic/combination-product reporting guidance when in module scope

Draft guidance must be labelled DRAFT and must not silently become a mandatory system rule.

## Tier E — United Kingdom

### MHRA
Include current:
- UK pharmacovigilance procedures guidance
- Great Britain vs Northern Ireland applicability
- UK ICSR requirements
- PSUR
- RMP
- PASS
- signal/safety-review procedures
- Windsor Framework-related PV guidance
- updated CIR 520/2012 implementation expectations where applicable

## Tier F — Canada

### Health Canada
Include current:
- Reporting Adverse Reactions to Marketed Health Products — Guidance for Industry
- current notices/clarifications
- Canada Vigilance requirements
- scientific literature reporting rules
- foreign report requirements
- regulatory-authority-source handling
- applicable electronic submission requirements

## Tier G — Australia

### TGA
Include current:
- Pharmacovigilance responsibilities of medicine sponsors
- sponsor reporting and record-keeping requirements
- serious ADR reporting
- safety issue notification
- literature monitoring
- third-party/vendor PV agreements
- duplicate prevention
- Australian PV contact expectations
- TGA inspection-related expectations

## Tier H — Japan

### PMDA / MHLW
Include applicable current:
- post-marketing safety reporting requirements
- MAH safety reporting responsibilities
- RMP
- package insert / safety communication ecosystem
- PMDA/MHLW post-marketing safety measures
- ADR reporting/data use
- E2B/regional implementation requirements where accessible and applicable
- Early Post-marketing Phase Vigilance when relevant

Where authoritative implementation material is available only in Japanese, translation/professional interpretation must be controlled and the original source retained.

## Jurisdictions to add before claiming global production scope

Before a release is advertised/configured for a jurisdiction, add that regulator's current primary source pack and jurisdiction-specific tests.

Examples may include:
- Swissmedic
- HSA Singapore
- Medsafe New Zealand
- ANVISA Brazil
- NMPA China
- MFDS Korea
- GCC/national Gulf regulators
- other authorities required by client/product scope

The platform must not claim "global compliance" merely because major ICH regions are covered.

## Knowledge ingestion policy

### Allowed for authoritative corpus
- official regulator/harmonisation websites
- official published guidance PDFs
- official implementation guides
- official schemas/code lists/business-rule files
- official laws/regulations where applicable

### Not authoritative by default
- vendor marketing pages
- blogs
- training institutes
- unofficial summaries
- model-generated explanations
- forums/social posts

These may support research but cannot be the source of a regulated requirement.

## Versioning and update policy

Each source record must contain:
- source ID
- canonical URL/reference
- checksum when file-based
- authority
- jurisdiction
- title
- revision/version
- publication date
- effective date
- superseded-by relation
- active/inactive status
- applicability tags
- ingestion date
- reviewer/approval status

When a regulator updates guidance:
1. retain previous version;
2. ingest the new version;
3. generate a controlled diff;
4. identify impacted URS/FRS;
5. identify impacted code/tests/SOPs;
6. assess implementation deadline;
7. validate changed behavior before activation.

## Sprint integration

Every sprint must include a Regulatory Knowledge Gate:

1. identify applicable authorities;
2. identify current authoritative documents;
3. extract requirements;
4. resolve cross-jurisdiction differences explicitly;
5. update URS/FRS;
6. create positive/negative test scenarios;
7. implement;
8. verify;
9. retain evidence.

## Conflict rule

Where jurisdictions differ:
- do not collapse requirements into a vague global rule;
- preserve jurisdiction-specific logic/configuration;
- identify which requirement is stricter and whether adopting it globally is lawful/appropriate;
- route unresolved regulatory interpretation to qualified PV/regulatory review.

## Definition of complete

Sprint 1 is not complete until:
- source register is versioned;
- required primary sources for current module scope are catalogued;
- each source is classified by authority/jurisdiction/status;
- existing URS/FRS is mapped to authoritative sources;
- unsupported model-memory-derived rules are identified;
- update monitoring strategy is defined;
- retrieval metadata model is implemented/planned;
- regulatory-source traceability is testable.
