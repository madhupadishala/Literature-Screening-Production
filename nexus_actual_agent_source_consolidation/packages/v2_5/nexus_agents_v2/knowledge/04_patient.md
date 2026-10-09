# 04 — Patient Information Extractor

## Purpose
Extract demographic and physical characteristics of the patient for E2B(R3) Section D (D.1–D.6) and decide whether the **patient criterion** for a valid ICSR is met.

## Regulatory basis
- **[VERIFIED]** GVP VI: an identifiable patient is one of the four minimum criteria.
- **[RECALLED]** GVP VI.B / E2B guidance: patient is identifiable when **at least one** of: initials, patient ID/record number, date of birth, age, age group, gestation period (foetal exposure), sex, (weight/height as supporting). Full name should **not** be transmitted; initials/ID only — privacy.
- **[RECALLED]** E2B(R3) data elements: D.1 name/initials; D.1.1.x record numbers; D.2.1 birth date; D.2.2 age at onset (value + UCUM unit a/mo/wk/d/h); D.2.2.1 gestation period at onset; D.2.3 age group (1 foetus, 2 neonate, 3 infant, 4 child, 5 adolescent, 6 adult, 7 elderly); D.3 weight (kg); D.4 height (cm); D.5 sex (0 unknown, 1 male, 2 female); D.6 LMP.
- **[RECALLED]** ICH E11 paediatric age bands (preterm/term neonate 0–27 d, infant/toddler 28 d–23 mo, child 2–11, adolescent 12–<18) and ICH E7 geriatric (≥65). Used for the **derived** group only.

## Rules implemented
- Evidence must be verbatim in source or the field is dropped.
- **No derivation into reported fields:** age is never computed from birth date (or reverse). Age group **as reported** and **derived** are separate outputs; derived is a labelled convenience, never written to D.2.3 as reported.
- Unit normalisation to kg / cm / UCUM; unknown units flagged, never guessed.
- Plausibility flags: age >120 y, weight outside 0.3–500 kg, height outside 20–260 cm; reported vs derived age-group mismatch; DOB vs age vs onset-year inconsistency (>1 yr).
- Sex mapped only from explicit wording ("female", "woman", "boy"); "pregnant" does not imply sex.
- Pregnancy/breastfeeding mention is **flagged** (`pregnancy_or_breastfeeding_mentioned`) for special-situation handling; details (parent-child section D.10, LMP, outcome) not extracted in v0.1 (D8).

## Not done here
Patient death details (D.9), parent information (D.10), medical history (Agents 2/3), ethnicity/race (collected only if region requires; sensitive).

## Privacy
Output marked `contains_personal_data=true`. Full names are not extracted by design. Retention/redaction policy needs to be applied by the platform.

## Edge cases to benchmark
Ranges ("in his 50s" → age group only, no age value), "elderly" w/o age, neonates in days vs hours, "teenager", twins, mixed units ("5 ft 7 in"), gestation reported in trimester only, paediatric case reported by parent.

## Decisions for you
- **D6** Derived age-group bands (E11/E7 above) vs your company convention.
- **D8** Death and pregnancy-outcome details: new agents or extensions of this one?
- Should "in his 50s" populate nothing (current) or an age-range note?
