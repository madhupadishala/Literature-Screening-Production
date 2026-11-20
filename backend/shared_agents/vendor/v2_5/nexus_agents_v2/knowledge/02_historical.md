# 02 — Historical Conditions Extractor

## Purpose
Extract medical history that is **over or unrelated in time to the event**: past illnesses, surgeries/procedures, family history, prior allergies/ADRs, and **past drug history** — for E2B(R3) D.7.1.r, D.7.1.r.6, D.8.r.

## Regulatory basis
- **[VERIFIED]** E2B(R3) IG G.k: concomitant = taken **at the time the reaction is observed**; *"other relevant medication history should be recorded in Section D.8"*. This is the boundary between this agent and Agent 3.
- **[VERIFIED]** E2B(R3) IG G.k: medications used **to treat** the reaction/event are **not** reported as drugs → excluded from both agents (emitted as `excluded_treatment_of_event`).
- **[VERIFIED]** D.7.2 / D.7.1.r exist for structured + text history; if history is unknown to the sender leave blank with null flavour UNK (never invent "none").
- **[RECALLED]** D.7.1.r fields: MedDRA term/version, start date, continuing (yes/no/unknown), end date, comments, family-history flag (D.7.1.r.6). D.8.r: drug name, MPID/substance, start/end dates, indication (MedDRA), reaction (MedDRA).
- **[RECALLED]** E2B IG: history should be *relevant*; ICH E2D encourages relevant history (previous reactions to same drug class, hepatic/renal impairment, etc.).

## Pipeline
LLM extracts all non-event conditions and all drugs with verbatim timing words → deterministic classifier assigns bucket (shared with Agent 3) → this agent returns `historical` + `unclassified` items + all family history.
Classifier order: (1) end date certainly before onset → historical; (2) stated "continuing = no"; (3) past-tense wording ("history of", "previously", "until", "years ago"); (4) otherwise `unclassified` with a flag.

## Not done here
MedDRA coding (separate coder; terms are returned **as reported**), relevance filtering (everything stated is kept; ranking later), reaction-history causality ("previous rash on DrugX" is captured as allergy/prior reaction, causality left to Agent 6).

## Edge cases to benchmark
Partial dates ("2015", "childhood"); "resolved" vs "in remission"; recurring/episodic conditions (migraine); "history of" used for chronic ongoing disease (e.g. "history of hypertension" often means ongoing → mis-bucketed as historical when no date/flag); family history; pregnancy history (G/P) — not modelled.

## Decisions for you
- **D7** `unclassified` items: surface for review (current behaviour) vs default to historical.
- Do you want "history of <chronic disease>" with no end date treated as **ongoing** (clinically safer, but contradicts literal wording)? I did **not** implement that heuristic.
