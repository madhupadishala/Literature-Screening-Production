# TheClinixAI Nexus — Eight-Agent Final Report

**Release:** Engineering Release 1.0.0 · **Date:** 2026-10-09 · **Contract version:** 1.0.0
**Knowledge register:** NEXUS-REG-001 v1.0.0 (11 verified entries, SHA-256 controlled)

Per the Golden Master Prompt: no background execution, test, deployment or approval is
claimed that did not actually occur. Everything below reflects executed work in this
environment; all items not executable here are listed as exact blockers.

---

## Per-agent reports

### Agent 1 — Literature Duplicate Detection

| Field | Information |
|---|---|
| Agent | literature_duplicate_detection v1.0.0 |
| Architecture | Python 3.12, pydantic contracts; deterministic DOI/PMID normalisation → bibliographic similarity (difflib/token-Jaccard) → patient-descriptor overlap → ICSR linkage; no LLM dependency in this release |
| Regulatory References | REQ-ICH-E2D-R1-FOLLOWUP (ICH E2D(R1) §4.5/§6.6) |
| Development | nexus_agents/agents/lit_duplicate.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 3 corpus tests + 2 behavioural tests, all executed and passing (test_evidence.txt) |
| Benchmark | Primary corpus 5/5 correct; adversarial (translated title, same DOI) 1/1 correct |
| Clinical Qualification | Not performed — requires expert-adjudicated corpus |
| Nexus Integration | Contract-ready; Nexus codebase not provided (blocker B1) |
| Deployment | Not deployed (blocker B1) |
| Blockers | B1, B4 (no embedding model service in this environment; semantic-embedding tier documented, not active) |

### Agent 2 — ICSR Duplicate Detection

| Field | Information |
|---|---|
| Agent | icsr_duplicate_detection v1.0.0 |
| Architecture | Deterministic identifiers (C.1.8.1 / sender+sender-ID / C.1.9.1) → field-weighted scoring (sex, age, onset, drugs, events, country, reporter, narrative) with hard sex-contradiction guard; EXACT reserved for identifier evidence, field-similarity caps at PROBABLE with mandatory human review |
| Regulatory References | REQ-EU-GVPVI-ADD1-DUP (GVP VI Addendum I), REQ-EU-GVPVI-VALID-ICSR, REQ-ICH-E2D-R1-FOLLOWUP |
| Development | nexus_agents/agents/icsr_duplicate.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 6 corpus classifications + sex-contradiction, sparse-case, reversible-merge tests, executed and passing |
| Benchmark | Primary corpus 6/6 correct |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1; calibrated probabilistic scoring (Fellegi–Sunter-style weights) requires trained parameters from adjudicated data (B4) |

### Agent 3 — Follow-up Questionnaire AI

| Field | Information |
|---|---|
| Agent | followup_questionnaire v1.0.0 |
| Architecture | Gap detection vs four minimum criteria + 16-field clinical checklist; contradiction detection (onset-before-treatment, outcome-without-date); priority scoring (clinical significance, minimum criteria, seriousness, contradictions); neutral non-leading question bank; reviewer-approval gate enforced in payload |
| Regulatory References | REQ-EU-GVPVI-VALID-ICSR, REQ-ICH-E2D-R1-FOLLOWUP, REQ-EU-GVPVI-TIMEFRAMES, REQ-EU-GVPVI-ADD2-PRIVACY |
| Development | nexus_agents/agents/followup.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 4 tests incl. no-redundant-questions and contradiction detection, executed and passing |
| Benchmark | Gap-detection accuracy 14/14 assertions |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1; outbound-communication channel integration untestable without Nexus (B1) |

### Agent 4 — Literature Inclusion / Exclusion Flagging

| Field | Information |
|---|---|
| Agent | literature_inclusion_exclusion v1.0.0 |
| Architecture | Dimensional assessment (11 dimensions) + controlled reason codes; prohibited-equivalence guards (non-company product ≠ irrelevant; invalid ICSR ≠ irrelevant; duplicate ≠ no new case; missing full text ≠ no AE) |
| Regulatory References | REQ-ICH-E2D-R1-FOLLOWUP, REQ-US-21CFR-314.80, REQ-EU-GVPIX-SIGNAL |
| Development | nexus_agents/agents/inclusion_exclusion.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 3 tests incl. reason-code traceability, executed and passing |
| Benchmark | Primary corpus 6/6; adversarial correction-notice correctly UNRESOLVED (no unsupported exclusion) |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1 |

### Agent 5 — Action Taken With Drug

| Field | Information |
|---|---|
| Agent | action_taken v1.0.0 |
| Architecture | Sentence-level pattern rules with drug attribution and clinical-distinction guards (treatment completed → 9; stopped before onset → 9; withheld for procedure → interruption; stopped for lack of efficacy → flagged not-AE-related); raw/normalised/E2B fields kept separate |
| Regulatory References | REQ-ICH-E2B-R3-ACTION-TAKEN (G.k.8: 1/2/3/4/0/9), REQ-US-FDA-AEMS-2026 |
| Development | nexus_agents/agents/action_taken.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 3 tests incl. NA-precondition enforcement and field separation, executed and passing |
| Benchmark | Primary corpus 8/8; adversarial 1/2 — colloquial "taken off" phrasing missed (predicted Unknown, safe direction; known recall gap) |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1; colloquial withdrawal phrasing recall gap (adversarial finding A1) |

### Agent 6 — Dechallenge Assessment

| Field | Information |
|---|---|
| Agent | dechallenge_assessment v1.0.0 |
| Architecture | Per drug-event pair: action (G.k.8) × documented course (E.i.7/narrative); confounder detection; explicit "improvement ≠ causality" disclaimer; NOT_ASSESSABLE when no withdrawal/reduction |
| Regulatory References | REQ-ICH-E2B-R3-DECHALLENGE (G.k.8 + E.i.7; no standalone dechallenge element exists) |
| Development | nexus_agents/agents/dechallenge.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 2 tests incl. withdrawal-alone-is-not-positive, executed and passing |
| Benchmark | Primary corpus 5/5; adversarial 0/1 — "plasmapheresis" confounder not in confounder lexicon → false POSITIVE (adversarial finding A2; unsafe direction, must be fixed before clinical evaluation) |
| Clinical Qualification | Not performed — blocked by finding A2 |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1, A2 (confounder lexicon coverage) |

### Agent 7 — Rechallenge Assessment

| Field | Information |
|---|---|
| Agent | rechallenge_assessment v1.0.0 |
| Architecture | Per drug-event pair: re-administration detection × recurrence detection; hypothetical/continuation/cycle/accidental-exposure distinctions; E2B G.k.9.i.4 mapping (1/2/3/4); guardrail: never suggests performing a rechallenge |
| Regulatory References | REQ-ICH-E2B-R3-RECHALLENGE |
| Development | nexus_agents/agents/rechallenge.py |
| Knowledge Integration | Connected (register-gated) |
| Testing | 3 tests incl. E2B mapping and guardrail, executed and passing |
| Benchmark | Primary corpus 6/6; adversarial 0/1 — recurrence expressed as "liver enzymes rose again" missed → UNRESOLVED (adversarial finding A3; abstains rather than false-positive) |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1, A3 (objective-finding recurrence phrasing recall gap) |

### Agent 8 — Medical History and CAP Extraction

| Field | Information |
|---|---|
| Agent | medical_history_cap_extraction v1.0.0 |
| Architecture | Section + pattern extraction with past/current, patient/family, confirmed/suspected, negated/positive distinctions; indication preserved separately; CAP scope enforced against documented field list; verbatim preserved with coding |
| Regulatory References | REQ-MEDDRA-29.0 (BLOCKED_LICENSE_REQUIRED) |
| Development | nexus_agents/agents/med_history.py, nexus_agents/terminology.py |
| Knowledge Integration | Blocked — licensed MedDRA 29.0 service unavailable in this environment; placeholder lexicon used, UNCODED flagged instead of invented |
| Testing | 3 tests incl. CAP-scope enforcement and UNCODED-not-invented, executed and passing |
| Benchmark | Distinction assertions passing on 2 scenario cases (negation, allergy, family, current-condition, indication) |
| Clinical Qualification | Not performed |
| Nexus Integration | Contract-ready; blocker B1 |
| Deployment | Not deployed |
| Blockers | B1, B2 (MedDRA licence), B3 (Nexus data dictionary for CAP field scope not provided — DEFAULT_CAP_FIELDS used) |

---

## Overall eight-agent release summary

- **Codebase:** `nexus_pv_agents/` — 8 agents, typed contracts (v1.0.0), register-gated knowledge, 3 E2E orchestration workflows, LangGraph adapter contract.
- **Tests:** 33/33 executed and passing (validation/test_evidence.txt, 2026-10-09).
- **Benchmarks:** primary labeled corpus 100% per-task accuracy (n=37 scenarios, developer-designed labels — NOT expert-adjudicated ground truth); adversarial hold-out (n=5) 3/5 correct, exposing findings A1–A3.
- **Regulatory verification (2026-10-09):** GVP VI Rev 2 + Addendum I/II; ICH E2D(R1) Step 4 (EU effective 2026-03-18); ICH E2B(R3) IG incl. G.k.8/G.k.9.i.4/E.i.7 code sets; FDA AEMS E2B(R3) mandate from 2026-10-01; MedDRA 29.0 current. Register NEXUS-REG-001 holds 11 entries with source URLs, versions and effective dates.

## Unresolved critical risks

1. **A2 — dechallenge false-positive on unlisted confounder** (unsafe direction; must be resolved before any clinical evaluation).
2. **B2 — licensed MedDRA/WHO-UMC terminologies unavailable**: all coding is placeholder-grade; no coded output is valid for regulatory use.
3. **B4 — no expert-adjudicated validation corpus exists**: benchmark labels are scenario-design labels; no clinical performance claim is made or permitted.
4. **A1/A3 — narrative recall gaps** for colloquial withdrawal and objective-finding recurrence phrasing (safe-direction abstentions, but recall below acceptance for high-risk fields).
5. **B1 — Nexus codebase, staging environment and data dictionary were not provided**: integration, deployment, security/tenant-isolation and CSV/GxP evidence are unexecuted by definition.

## Blocker register

| ID | Blocker |
|---|---|
| B1 | Actual Nexus repository/staging environment not provided — integration, deployment and tenant-isolation tests cannot be executed |
| B2 | MedDRA 29.0 (and WHO-UMC) licences required for production terminology |
| B3 | Nexus CAP data dictionary not provided — CAP scope uses documented defaults only |
| B4 | Expert adjudicators / licensed reference resources unavailable — clinical qualification not performable |
| A1 | Action-taken recall gap: colloquial withdrawal phrasing |
| A2 | Dechallenge confounder lexicon coverage (unsafe false-positive) |
| A3 | Rechallenge recurrence phrasing gap for objective findings |

## Next five implementation actions

1. Fix A2 (expand confounder detection to interventional procedures; add negated-confounder handling), re-run full suite and adversarial set; gate any clinical evaluation on A2 closure.
2. Obtain the Nexus repository and data dictionary; execute Phase 7 integration (inventory, interface binding, staging deployment, tenant-isolation and prompt-injection tests).
3. Procure MedDRA 29.0 / WHO-UMC licences; replace the placeholder terminology service; re-run Agent 8 and duplicate-coding tests against licensed data.
4. Build the expert-adjudicated validation corpus (Phase 5) with dual annotation and adjudication; set pre-defined acceptance thresholds for high-risk false negatives before testing.
5. Close A1/A3 recall gaps against the adjudicated corpus (not against the hold-out), then repeat the blinded clinical evaluation and prepare CSV/GxP release evidence for Medical/PV sign-off.
