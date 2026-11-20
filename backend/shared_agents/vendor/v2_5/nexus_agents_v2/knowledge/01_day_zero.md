# 01 — Day Zero Identifier

## Purpose
Determine whether a case is a valid ICSR, the date the regulatory clock starts (day zero), and the due dates — with a documented, defensible basis an inspector can follow.

## Regulatory basis
- **[VERIFIED]** GVP Module VI (Rev 2, EMA/873138/2011, in force 22 Nov 2017), VI.B.7: the clock starts as soon as information containing the minimum reporting criteria is brought to the attention of **any personnel of the MAH** (incl. contractors/partners); that date is **day zero**.
- **[VERIFIED]** Four minimum criteria: identifiable reporter, identifiable patient, suspect medicinal product, suspected adverse reaction. Missing one → follow up; clock not started as a valid case.
- **[VERIFIED]** Literature (GVP VI Appendix 2, "day zero"): with weekly literature searching, for a reaction present in an **abstract**, day zero = **date the search was conducted**, not date the record appeared in the database or was passed to the PV team. If full text is ordered after search, day zero = date the **minimum information for validity becomes available**.
- **[VERIFIED]** Reporting clocks measured from day zero: 15 calendar days (serious), 90 calendar days (non-serious) for EU MAH expedited reporting.
- **[VERIFIED]** Inspectors (SÚKL 2024 inspection themes) note that Module VI wording for **local** literature can be read in more than one way → treat as a policy decision (D2).
- **[RECALLED]** Follow-up: clock restarts from receipt of *significant* new information (VI.B.7). Significance examples in my rules: new suspect drug, new reaction, seriousness change, outcome/death, dechallenge/rechallenge result.
- **[RECALLED]** US (21 CFR 314.80/600.80): 15 calendar days for serious & unexpected; not implemented (config only).

## Inputs / outputs
In: ordered receipt events (date, received_by, text), source type, optional search/full-text dates, seriousness (from Seriousness Agent), region config.
Out: `valid_icsr`, `day_zero`, `day_zero_basis`, `missing_criteria`, per-criterion first-available date + quote, due dates (serious / non-serious / applicable), follow-up clock starts, flags.

## Rules implemented
1. LLM only reads text and reports which criteria are present **with a verbatim quote**. Quotes not found in the source are discarded (ungrounded).
2. Criteria can be **assembled across contacts**; day zero = the date the last missing criterion first became available.
3. Reaction must be associated with product by reporter/text; bare lists don't count.
4. Literature (global): abstract → search date; else full-text receipt date.
5. Dates are computed by code, never by the LLM. Calendar days, no weekend extension.
6. Seriousness unknown → both due dates shown, earlier applies (D3).
7. Receipt by contractor/affiliate counts as receipt (any personnel).

## Not handled yet / edge cases to test
Solicited reports (causality required), clinical-trial SUSAR clocks (7/15 days), regulator-forwarded cases, social media, partner-contract (SDEA) date overrides, time-zone/receipt-after-hours conventions, duplicate detection.

## Decisions for you
- **D1 Reporter identifiable:** default `any_one` of name/initials/address/contact (matches E2B IG practice); strict alternative = name-or-initials **and** qualification. Which does your SOP use?
- **D2 Local literature:** treat as awareness date (default flag) or fixed SOP rule?
- **D3** Unknown seriousness: apply the earlier (15-day) date until assessed — OK?
