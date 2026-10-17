# 03 — Current Conditions & Drugs Extractor

## Purpose
Extract what was **ongoing at the time of the event**: concurrent conditions, non-drug therapies, and drugs being taken (concomitant candidates) — with timing, so downstream agents can classify and code.

## Regulatory basis
- **[VERIFIED]** E2B(R3) IG G.k: suspect medicines may have been stopped before the reaction; **concomitant = taken at the time the reaction is observed**; earlier history → D.8; **treatment-of-event drugs excluded**.
- **[VERIFIED]** E2B(R3) IG D.7.3: concomitant *therapies* (radiotherapy, drug class, dietary measures) at time of reaction.
- **[VERIFIED]** One suspect drug minimum per valid ICSR (G.k) — enforced by Day Zero/Agent 1, not here.
- **[RECALLED]** G.k.1 role codes: 1 suspect, 2 concomitant, 3 interacting, 4 drug not administered. D.7.1.r.3 "continuing" = yes for ongoing conditions.
- **[RECALLED]** GVP VI: suspect/interacting vs concomitant is the *reporter's* characterisation where given; do not override it silently.

## Pipeline
Same single extraction as Agent 2 (one LLM call, `run_both`) → every item lands in exactly one bucket. This agent returns `current` conditions (family history excluded) and `current` + `post_onset` drugs.
- `post_onset` (started after onset) kept and flagged: could be treatment, a new suspect, or a late concomitant — Agent 1 decides.
- `stated_role` is passed through **as reported**, never inferred.

## Ownership boundary with existing Agent 1 (Drug Extraction & Classification)
This agent does **not** assign suspect/concomitant/interacting. It supplies timing + stated role. Duplicated drug extraction between this agent and Agent 1 is a known overlap (D4).

## Edge cases to benchmark
Drugs given "since" a date without end; PRN meds; dose changes (multiple rows per drug); drug stopped on the day of onset (end date equals onset → current by rule); vaccines/biologics/herbals/OTC; "prior to admission" meds; combination products; condition and event overlap (e.g. "worsening of asthma" — is it history or event? flagged via `is_the_adverse_event_itself`).

## Decisions for you
- **D4** Keep this agent as a thin timing/extraction layer feeding Agent 1 (recommended), or let it own concomitant classification?
- Include habits (tobacco/alcohol) under current conditions (current behaviour: yes, kind=habit).
