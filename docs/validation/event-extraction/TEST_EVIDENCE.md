# Executed software evidence - 2026-10-08

121 relevant tests passed in the event runtime, shared event worker, shared PV service and specialist regressions.
Official FDA XML fixtures: 10 scenarios, all 26 reaction records matched their expected source codes.
Actual local English OCR execution tested on a clearly labelled synthetic scanned PDF.
Patient-ID ambiguity in OCR (P001/POO1) remains a documented visual-review issue.
Pinned schema validator tested using a software-test-only XSD; no FDA/EMA regional bundle was available for full regulatory validation.

Live smoke execution: blocked, model and credentials missing.
Blinded expert benchmark execution: blocked, adjudicated expert reference missing.
No live clinical accuracy, release approval or deployed runtime is claimed.

Qualification hardening: audit-row deletion and duplicate run IDs are rejected; reviewer identities are checked as distinct nonempty strings; the live smoke test rejects wrong-patient and extra event proposals. Evidence is written to the documented location.
