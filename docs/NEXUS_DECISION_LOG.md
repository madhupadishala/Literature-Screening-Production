# Nexus Architecture Decision Log

## DEC-001 — Nexus is a modular platform
**Status:** Approved

Nexus is one platform with tenant-scoped commercial modules. Literature, Intake and Case Processing are not separate codebases.

## DEC-002 — Entitlement and RBAC are separate controls
**Status:** Approved

A tenant must be entitled to a module and a user must hold the required permission. Neither condition alone grants access.

## DEC-003 — Authorization is fail-closed
**Status:** Approved

Missing, disabled, suspended or expired entitlements deny module access. Direct URL/API access must not bypass entitlement enforcement.

## DEC-004 — Environments are explicit authorization context
**Status:** Approved

Module entitlements are stored independently for PROD, UAT and TRAINING.

## DEC-005 — Case Processing depends on Intake
**Status:** Approved

The Nexus Case Processing module can only be effectively enabled when Intake is enabled for the same tenant and environment.

## DEC-006 — Existing Literature access is preserved during migration
**Status:** Approved

Migration 021 enables Literature for existing tenants across controlled environments. All new modules remain disabled until deliberately activated.

## DEC-007 — Entitlement changes are versioned and audited
**Status:** Approved

Every entitlement change requires a reason, records the prior version, and writes an audit event.

## DEC-008 — Regulated module access is not a UI-only control
**Status:** Approved

Navigation filtering is convenience only. Server-side API/workflow authorization remains authoritative.

## DEC-009 — Platform RBAC is separate from tenant RBAC
**Status:** Approved

TheClinixAI Control Plane authority is stored in `platform_role_assignments`, independently of a user's role inside any customer tenant. Client Admin/Owner roles cannot activate commercial modules.

## DEC-010 — Commercial entitlement management is cross-tenant Control Plane work
**Status:** Approved

Clients may read their own licensed modules. TheClinixAI platform-authorized users may inspect and change a target tenant's entitlements through the platform API with a mandatory change reason and audit history. Platform administrators do not need to become operational members of every client tenant to manage licensing.

## DEC-011 — Literature is an upstream safety source
**Status:** Approved

Literature produces governed source evidence and downstream Intake exports. The common safety backbone owns Intake and Case Processing records; Literature tables are not repurposed as the case database.

## DEC-012 — Patient identity is scoped to the intake/case context
**Status:** Approved

Nexus does not infer a global patient identity across unrelated safety cases. Patient records remain scoped to the regulated source/intake/case lineage unless a later governed process explicitly establishes a relationship.

## DEC-013 — Safety case versions are immutable
**Status:** Approved

A case update creates a new `safety_case_versions` snapshot with deterministic SHA-256 content hashing and a mandatory change reason. Prior versions are never overwritten.

## DEC-014 — E2B(R3) sections remain explicit inside the internal case snapshot
**Status:** Approved

The internal case snapshot preserves explicit C/D/E/F/G/H regulatory sections while Nexus workflow state, assignments and review-task metadata remain outside the immutable E2B-oriented payload.

## DEC-015 — Safety evidence is linked, not silently copied
**Status:** Approved

The common safety layer records source lineage and evidence links back to governed upstream artifacts. Derived records must retain the originating source/export identifiers and hashes needed for traceability.

## DEC-016 — All Intake sources converge on one persistence path
**Status:** Approved

Manual, Document, structured API, and governed Literature handoffs are normalized into the Sprint 2 `IntakeDraft` contract and persisted through the same common safety transaction boundary.

## DEC-017 — Regulated source documents cannot use the legacy in-memory registry
**Status:** Approved

Document Intake stores immutable source bytes, SHA-256, metadata and evidence linkage in persistent PostgreSQL storage for development/UAT. The older memory-only document manager is not a regulated Intake evidence store.

## DEC-018 — Extraction is separate from ingestion
**Status:** Approved

Sprint 3 records the original source and creates the Intake. OCR, parsing, extraction, confidence, evidence spans and human verification belong to Sprint 4 and must not be hidden inside source ingestion.

## DEC-019 — Intake source idempotency fails closed on content mismatch
**Status:** Approved

Replaying the same source/request identity with identical content reuses the existing Intake. Reusing that identity with materially different safety content is rejected instead of overwriting or silently forking the regulated record.

## DEC-020 — Original Intake source evidence is immutable
**Status:** Approved

Source documents remain immutable evidence. Extracted text is a derived artifact with its own hash and never replaces or mutates the original uploaded bytes.

## DEC-021 — Extraction is assistive, not authoritative
**Status:** Approved

Parser/extractor output is stored as suggestions with confidence and evidence. Suggestions do not become regulated structured safety data until a human accepts or edits them.

## DEC-022 — Human extraction decisions are individually auditable
**Status:** Approved

Every accept, edit or reject action records the suggestion, final payload where applicable, reviewer, reason and timestamp. Accepted/edited data is materialized into the common Sprint 2 safety entities.

## DEC-023 — Source Review and formal Triage are separate controls
**Status:** Approved

Sprint 4 verifies that source evidence has been reviewed and structured appropriately. It does not decide formal ICSR validity, seriousness/priority triage or disposition; those remain Sprint 5 responsibilities.

## DEC-024 — Nexus Intake extraction has a zero-cost baseline
**Status:** Approved

TXT, DOCX and PDF text extraction use local/open-source libraries already in the Nexus stack. Legacy DOC is preserved and fails closed for automated parsing rather than requiring a paid parser.

## DEC-025 — Formal ICSR validity is a human-confirmed decision
**Status:** Approved

Nexus may recommend whether the four minimum ICSR criteria are present, but a processor explicitly confirms each criterion and the overall validity decision. System and human results are both retained.

## DEC-026 — ICH E2D(R1) minimum-criteria semantics govern Sprint 5
**Status:** Approved

The Sprint 5 validity gate uses the current ICH E2D(R1) four-minimum-criteria model. An interacting medicinal product is treated as suspect for minimum-criteria purposes. Reporter identifiability is based on qualifying identifiable characteristics rather than hard-coding reporter country as a minimum criterion.

## DEC-027 — Missing minimum criteria route to due-diligence follow-up
**Status:** Approved

A report missing one or more minimum criteria is not silently discarded. The triage record may remain UNRESOLVED with follow-up required. A true INVALID decision is a separate explicit human decision.

## DEC-028 — Triage outcome is derived from internally consistent human decisions
**Status:** Approved

The processor confirms evidence, validity, seriousness, special situations, priority and follow-up need. Nexus derives the next triage outcome so contradictory combinations cannot be saved.

## DEC-029 — Sprint 5 completes TRIAGE but does not perform duplicate matching
**Status:** Approved

A valid finalised triage routes the Intake to DUPLICATE_REVIEW. Duplicate/follow-up matching belongs to Sprint 6. Sprint 5 cannot create a Nexus Case or perform final Intake disposition.

## DEC-030 — Triage assessments are versioned, not overwritten
**Status:** Approved

Every finalised triage creates a new immutable assessment version. Reassessment after new information preserves prior decisions and rationale.

## DEC-031 — Every valid ICSR enters duplicate/follow-up review
**Status:** Approved

A valid finalised triage outcome routes to a dedicated DUPLICATE_REVIEW task. Duplicate/follow-up review must complete before a valid Intake can reach final disposition.

## DEC-032 — Duplicate scores are explainable suggestions, never final decisions
**Status:** Approved

The deterministic matcher stores score factors and evidence. A score may rank a candidate but cannot automatically classify an Intake as DUPLICATE or FOLLOW_UP.

## DEC-033 — Follow-up and duplicate are distinct regulated relationships
**Status:** Approved

FOLLOW_UP represents new information related to an existing case. DUPLICATE represents repeated reporting of the same case information. Nexus stores `case_relationship` separately from `duplicate_status`.

## DEC-034 — Intake disposition is server-policy controlled
**Status:** Approved

Allowed dispositions are derived from validity, triage, duplicate-review state, case relationship and tenant entitlements. The client cannot enable CREATE_NEXUS_CASE or EXPORT_EXTERNAL by presentation logic alone.

## DEC-035 — Nexus Intake standalone ends at governed external handoff
**Status:** Approved

Tenants without Case Processing may complete Intake/Triage/Duplicate review and generate a hash-locked Nexus Safety JSON handoff package. This does not represent live transmission to a third-party safety database.

## DEC-036 — Case creation and disposition are atomic
**Status:** Approved

CREATE_NEXUS_CASE uses the same transaction as the final Intake disposition. Failure in either operation rolls back the entire action.

## DEC-037 — HOLD is non-terminal
**Status:** Approved

HOLD and INCOMPLETE_FOLLOW_UP create a versioned disposition action but leave `disposition_status = ON_HOLD`. The workflow may continue after new information is received.

## DEC-038 — External handoff packages exclude raw source bytes
**Status:** Approved

The governed external package contains structured safety data, lineage, document metadata/hashes and assessment evidence. Original uploaded document bytes remain in the controlled source-document store and are not embedded in the handoff JSON.
