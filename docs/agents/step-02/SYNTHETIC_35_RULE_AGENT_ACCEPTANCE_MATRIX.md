# Nexus shared synthetic ICSR — 35 approved-rule acceptance variants

**Purpose:** One synthetic master ICSR, modified in 35 controlled variants, one per existing clinical rule owner. This is a **test specification, not evidence that any Nexus AI agent passed**. Data are fictional and must not be inserted as live ICSRs.

**Master case SYN-ICSR-001:** Synthetic adult patient P-001; identifiable reporter Dr Example; suspect Product A (fictional), concomitant Product B, AE treatment Product C, historical Product D; source report dated 2026-09-20. A, B, C and D are fictional labels rather than real product identities. Base narrative: patient used A during September 2026; rash, itching and headache are separately described; additional evidence is introduced only by each variant. Do **not** combine mutually inconsistent variant facts into one factual ICSR. Each run resets to this baseline.

**Test protocol:** For each row, inject only the variant facts; invoke the existing mapped owner agent via Nexus orchestration and the same shared Knowledge Router; assert expected clinical output, exact source evidence and rationale, matching active rule ID/version, tenant/client scope, and no invented facts. A synthetic fixture alone never proves a rule is executable. No placeholder can count as passing. Verify adverse outcomes and cross-rule contradictions. Activate only a real published rule version once the agent's database-backed evaluation and expert-reviewed assertions pass.

| # | Rule | Existing owner | Synthetic variant input | Required assertion |
|---:|---|---|---|---|
| 1 | ACT-001 | Action Taken | Suspect Product A withdrawn; Product B continued unchanged. | A=Drug Withdrawn; B=No Change; never copy A action to B. |
| 2 | AE-001 | AE Extraction | Patient separately reports rash, itching and headache. | Three distinct source-grounded event candidates retained. |
| 3 | AE-002 | AE Extraction | Hemoglobin 8 g/dL, no anemia diagnosis or symptom reported. | Do not invent anemia AE; preserve abnormal lab finding. |
| 4 | AE-003 | AE Extraction | Customer says 'this medicine cost me a fortune'. | Financial complaint is not an adverse event. |
| 5 | AE-004 | AE Extraction | Patient says 'I felt like I died', later confirms alive. | Do not code death or fatal outcome; figurative statement retained. |
| 6 | AE-005 | AE Extraction | Rash described in physician note section 2, line 4. | Capture verbatim, selected AE, source location and rationale. |
| 7 | AE-006 | AE Extraction | Rash disappeared; headache improving; itching outcome absent. | Resolved / Recovering / Unknown individually. |
| 8 | AE-007 | AE Extraction | Rash began 2026-09-14, stopped 2026-09-18; headache start year only. | Preserve exact rash dates and year-only headache precision. |
| 9 | AE-008 | AE Extraction | Report received 2026-09-20: rash began 'yesterday'; headache 'last month'. | Rash onset 2026-09-19; headache month precision only. |
| 10 | AE-009 | AE Extraction | Physician calls rash 'severe', with no seriousness criterion. | Severity severe; regulatory seriousness not inferred. |
| 11 | AE-010 | AE Extraction | Rash and itching separate; client setting requests merging without authorized policy. | Retain separate events; reject unauthorized override. |
| 12 | AE-011 | AE Extraction | Patient says 'my head was killing me yesterday' and 'no chest pain now'. | Interpret possible headache with evidence; do not infer death/chest pain. |
| 13 | DCH-001 | Dechallenge | Suspect A stopped; rash resolves without AE-specific treatment. | Positive dechallenge for A–rash pair if chronology qualifies. |
| 14 | DCH-002 | Dechallenge | Suspect A stopped; headache recovers after headache-specific therapy. | Not Applicable under approved Nexus convention; preserve therapy. |
| 15 | DCH-003 | Dechallenge | Suspect A stopped; itching course not recorded. | Unknown; if documented no improvement after withdrawal, Negative. |
| 16 | DR-001 | Drug Extraction | Product A suspected; B overlaps; C treats rash; D stopped earlier. | Capture all four roles with source names and patient linkage. |
| 17 | DR-002 | Drug Extraction | B exposure overlaps A; D ended 6 months before A. | B concomitant; D historical; no inferred gaps. |
| 18 | DR-003 | Drug Extraction | C prescribed for rash, followed by new itching attributed to C. | Retain C treatment role; record distinct suspected reaction linkage. |
| 19 | DR-004 | Drug Extraction | A 10 mg once daily, later twice daily; same form and strength. | One drug product with two dated regimens. |
| 20 | DR-005 | Drug Extraction | A 10 mg tablets and A 20 mg capsules explicitly reported. | Separate strength/formulation product records. |
| 21 | DR-006 | Drug Extraction | A given IV; formulation not stated. | Form unknown, never infer injection from IV route. |
| 22 | DR-007 | Drug Extraction | Treatment C and historical D each have dosage schedule changes. | Apply identity and regimen normalization to all roles. |
| 23 | DR-008 | Drug Extraction | Patient says only generic 'paracetamol'; separate verified brand for B. | Generic fallback preserved; verified brand resolved with provenance. |
| 24 | DR-009 | Drug Extraction | Product master lists A and C, but C is only AE treatment. | Dictionary evidence used; company ownership checked only for suspect A. |
| 25 | DR-010 | Drug Extraction | Generic suspect A matches MAH ingredient but formulation/market unresolved. | Provisional company suspect only; not definitive product identity. |
| 26 | DR-011 | Drug Extraction | Historical D used Jan 1–5 and March 10–12. | Preserve two discontinuous periods, not continuous Jan–Mar. |
| 27 | DR-012 | Drug Extraction | Prior vaccine dose in 2023; suspected vaccine dose in 2026. | Past vaccine to history, suspected dose to suspect with dose provenance. |
| 28 | HIST-001 | Medical History | Patient reports hypertension, prior tobacco and social alcohol use. | Unified history with clinical and social entries and source provenance. |
| 29 | IRD-001 | Day Zero | All four validity elements known by MAH sales employee Sep 20; PV team informed Sep 22. | Qualifying awareness Sep 20, not later transfer. |
| 30 | IRD-002 | Day Zero | Medical rep orally hears valid case Sep 20; formal email Sep 22. | First qualifying oral receipt Sep 20 retained. |
| 31 | IRD-003 | Day Zero | Identifiable reporter/patient/product received Sep 20; AE arrives Sep 23. | Validity-completion date Sep 23; initial receipt preserved. |
| 32 | IRD-004 | Day Zero | Paper published Sep 1; MAH retrieves qualifying literature Sep 20. | Apply scoped literature retrieval/stamp convention; preserve both dates. |
| 33 | IRD-005 | Day Zero | Third-party post discovered Sep 20; contrast qualifying MAH-owned Sep 18 post. | Third-party discovery Sep 20; owned-channel posting Sep 18 if valid. |
| 34 | IRD-006 | Day Zero | Partner receives valid case Sep 19; MAH receives Sep 22. | Preserve both; apply partner original date only where authorized scope permits. |
| 35 | RCH-001 | Rechallenge | A restarted after dechallenge Unknown; new rash reported following restart. | Default Not Applicable under convention; preserve independent restart/recurrence evidence. |

## Release evidence record (not yet filled)

For each rule capture: test execution ID, agent version, database rule ID/version, source citation, actual output, expected output, PASS/FAIL, reviewer, reviewer date, and approval audit ID. **Initial state for all 35: NOT RUN / NOT ACTIVATED**. Update results only using observed test execution; do not infer results from this checklist.

## Known blocking gap

The current Neon `nexus_clinical_rule_revisions` database has 35 DRAFT rows with `never_activate_placeholder` decision tables. The current PostgreSQL rule-store adapter evaluates structured decision tables; it does not yet interpret clinical natural-language policies directly. A safety-preserving implementation must add a versioned policy interpretation/resolution path or compile true decision tables, then execute the above checks. Merely changing `approval_status` would create false activation.
