# Nexus Sprint 4 — Intake Worklist, Source Review and Extraction

## Objective
Turn the Sprint 2/3 Intake records into a real processor workspace where the original safety source, extracted suggestions and structured safety data can be reviewed together.

## Workflow

```
Original source
    ↓
Zero-cost document parser
    ↓
Deterministic PV suggestions
    ↓
Human review
    ├── Accept
    ├── Accept edited
    └── Reject
    ↓
Structured Patient / Reporter / Product / Event / Test data
    ↓
Source Review VERIFIED
    ↓
Sprint 5 formal ICSR validity + triage
```

## Source preservation
- Original uploaded bytes remain unchanged in `safety_source_documents`.
- The original source is exposed only through a tenant/module/RBAC-protected endpoint.
- Extracted text is stored separately with its own SHA-256.
- The extracted text never replaces the source document.

## Extraction
Zero-cost Sprint 4 parsing supports:
- TXT — UTF-8 text extraction.
- DOCX — Mammoth raw-text extraction.
- PDF — unpdf/PDF.js server-side text extraction.
- Legacy DOC — retained as source evidence; automatic zero-cost parsing fails closed and the original can be reviewed manually.

The deterministic PV extractor currently suggests:
- Patient age/sex when explicit evidence is present.
- Reporter qualification only when reporter context is explicit.
- Suspect product terms from labelled source statements.
- Event/reaction terms from labelled source statements.

This is intentionally conservative. Missing suggestions do not mean absence of safety information.

## Human governance
Every suggestion stores:
- type and entity key;
- suggested structured payload;
- confidence;
- evidence text;
- source character locator;
- human decision;
- final payload when accepted/edited;
- reviewer, reason and timestamp.

Only ACCEPTED or EDITED suggestions materialize into the common safety entities.

## Review completion
Source Review may be marked VERIFIED only when:
- the current extraction run has no pending suggestions; and
- for document sources, extraction is no longer PENDING or IN_PROGRESS.

A failed automatic extraction may still be manually reviewed from the immutable original source and verified with an auditable reason.

Source Review verification does **not** complete the formal TRIAGE task. Formal ICSR validity, seriousness/priority triage and disposition belong to Sprint 5.

## Explicit non-goals
- No MedDRA/WHODrug coding.
- No ICSR validity determination.
- No seriousness/expectedness/causality decision engine.
- No duplicate/follow-up engine.
- No generative AI dependency.
- No autonomous regulated disposition.

## Exit criteria
- Intake worklist is entitlement-aware and displays review/extraction state.
- Processor can open one Intake workspace.
- Original source is available under protected access.
- PDF/DOCX/TXT extraction is available without paid APIs.
- Suggestions include confidence and source evidence.
- Human accept/edit/reject decisions are persisted and audited.
- Accepted/edited suggestions update the common safety entities.
- Source Review cannot be verified with pending current suggestions.
- Sprint 5 TRIAGE tasks remain untouched.
- Migration 024 and Sprint 4 verification pass.
