# Nexus Agents v2 — Knowledge Pack: Review & Approval

Five agents, one knowledge document each. Code is already built and tested (9/9 unit tests, stubbed LLM); **nothing is production-qualified until you approve these docs and we run the gold-set benchmark.**

| # | Agent | Doc | E2B(R3) scope |
|---|---|---|---|
| 1 | Day Zero Identifier | 01_day_zero.md | C.1.4 / C.1.5 (receipt dates), validity, clocks |
| 2 | Historical Conditions Extractor | 02_historical.md | D.7.1.r (ended), D.7.1.r.6, D.8.r |
| 3 | Current Conditions & Drugs Extractor | 03_current.md | D.7.1.r (continuing), D.7.3, concomitant G.k inputs |
| 4 | Patient Information Extractor | 04_patient.md | D.1–D.6 |
| 5 | Reporter Information Extractor | 05_reporter.md | C.2.r |

## How sources are marked in every doc
- **[VERIFIED]** = I read it in this session from EMA/ICH/FDA/regulator-authored or regulator-presented material.
- **[RECALLED]** = from my background knowledge of ICH E2B(R3)/GVP; accurate to the best of my knowledge but **I did not re-read the primary text** — please check against the PDF before approving.
- **[POLICY]** = a design choice that is mine, not a regulation. Needs your decision.

## Limits of this research (be aware)
- I did not read full-text GVP Module VI / ICH E2B(R3) IG PDFs end-to-end; search returned excerpts and secondary summaries. Section numbers marked [RECALLED] must be confirmed.
- Not covered yet: CDSCO/PvPI (India), PMDA, Health Canada, MHRA specifics. Regional clocks are config, only EU defaults are set.
- I could not access the private repo `Literature-Screening-Production`, so contracts here are standalone. Integration with Agents 1–7 needs an adapter pass.

## Decisions I need from you (consolidated)
D1. Reporter "identifiable" rule (doc 01/05)  D2. Local-literature day zero (01)  D3. Unknown seriousness handling (01)
D4. Current-drugs vs Agent 1 ownership of role classification (03)  D5. Primary-source selection rule (05)
D6. Age-group bands for derived group (04)  D7. Unclassified items: surface vs default (02/03)  D8. Death/pregnancy details belong to which agent (04)
