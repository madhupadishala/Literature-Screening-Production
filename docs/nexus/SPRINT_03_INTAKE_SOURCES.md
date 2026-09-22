# Nexus Sprint 3 — Intake Sources

## Objective
Allow Manual, Document, structured API, and governed Literature sources to create the same Nexus common Intake record without source-specific safety databases.

## Canonical flow

```
Manual ─────────┐
External API ───┼──> IntakeDraft ──> Common Intake Persistence ──> SafetySource + IntakeRecord
Document ───────┤
Literature ─────┘
```

Every successful new Intake also creates the initial TRIAGE review task established in Sprint 2.

## Source rules

### Manual
- Human-entered structured safety data.
- Source system is fixed to `NEXUS_MANUAL`.
- Requires a request/idempotency key.
- Supports patient, reporter, product, event and test structures.

### Structured API
- Authenticated Nexus API ingestion for integrations.
- Requires caller source-system identity and idempotency key.
- Uses the same common safety DTOs as Manual Intake.
- External service-account/API-key lifecycle is outside Sprint 3; the endpoint uses the existing authenticated Nexus tenant context.

### Document
- Supports PDF, DOC, DOCX and plain text.
- Maximum Sprint 3 document size: 10 MB.
- Original bytes are persisted transactionally in PostgreSQL for development/UAT.
- SHA-256, file metadata and evidence linkage are recorded.
- Extraction status starts as `PENDING`.
- Document parsing/extraction is Sprint 4, not Sprint 3.

### Literature
- Continues to use the governed Literature Intake export.
- The immutable Literature export is adapted into the same common Intake persistence layer.

## Idempotency
A channel request identity resolves to one SafetySource. Replaying identical content returns the existing Intake. Reusing the same identity with different safety content fails closed.

## Explicit non-goals
- No OCR/LLM extraction in Sprint 3.
- No email mailbox intake yet.
- No WhatsApp/voice/call transcription.
- No external safety database gateway.
- No MedDRA/WHODrug dependency.
- No reliance on the legacy in-memory document registry for regulated Intake evidence.

## Exit criteria
- Four source routes converge on one Intake persistence function.
- Manual and API structured submissions map to the Sprint 2 safety entities.
- Document source bytes survive process restart because they are database-backed.
- Literature still uses its governed handoff and does not bypass MR/source lineage.
- All Intake source endpoints enforce the Intake entitlement and `intake.create` permission.
- Idempotency is deterministic and rejects changed content under a reused identity.
- Migration 024 and Sprint 3 verification pass.
