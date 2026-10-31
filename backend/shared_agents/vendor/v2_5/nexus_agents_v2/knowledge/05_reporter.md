# 05 — Reporter Information Extractor

## Purpose
Extract primary source(s) of information (E2B(R3) C.2.r), code their qualification, pick the primary source for regulatory purposes, and decide whether the **reporter criterion** is met.

## Regulatory basis
- **[VERIFIED]** GVP VI: an identifiable reporter is one of the four minimum criteria.
- **[VERIFIED]** E2B(R3) has a repeatable primary-source block C.2.r and a flag for the **primary source reporter for regulatory purposes** (FDA regional spec lists it as C.2.r.5).
- **[RECALLED]** C.2.r fields: given/family name, organisation, department, address (street/city/state/postcode), country (ISO 3166-1 alpha-2), telephone, email, **C.2.r.4 qualification: 1 Physician, 2 Pharmacist, 3 Other health professional, 4 Lawyer, 5 Consumer/other non-health professional**.
- **[RECALLED]** GVP VI: the reporter qualification is as **reported/stated**; a patient reporting medical details remains a consumer; HCP confirmation upgrades the case but does not change the original reporter's qualification.
- **[RECALLED]** Country of primary source (C.2.r.3) drives regional reporting (and COI Agent 3 uses it as input but is distinct).

## Rules implemented
- Extract only people who **supplied the information**; patient only if self-reported; exclude company staff who forwarded.
- Occupation copied verbatim, then mapped by deterministic keyword rules to codes 1–5. Unmapped → flag for human; no guessing.
- Patient/relative/caregiver → 5.
- Country text → ISO-2 via a small map; unmapped → flag (no guess). **Map is minimal; needs full ISO table before production.**
- **Primary source for regulatory purposes** = first HCP (codes 1–3) in report order, else first reporter (D5). Multiple reporters with different qualifications → flag.
- `reporter_identifiable` = any of name, initials, address, phone, email, organisation present (policy D1; shared with Day Zero).

## Privacy
Contains personal data; output marked accordingly. Contact details extracted only where stated.

## Edge cases to benchmark
Literature authors (first author vs corresponding author; country = author affiliation), reporter = patient's lawyer, "healthcare professional" unspecified (→3), student/intern, reporter via distributor/sales rep (company staff?), anonymous consumer with only country, reporter name in signature block vs forward header.

## Decisions for you
- **D1** identifiability rule (see 01).
- **D5** Primary-source rule: first HCP by order (current) vs highest medical qualification (physician > pharmacist > other HCP > consumer) vs company SOP.
- Literature: which author is the "reporter"? Current default: not handled specially → needs rule.
