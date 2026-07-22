# ClinixAI Pharmaceutical Product Intelligence Batch

Status: Implemented and locally verified
Knowledge version: PPI-KB-1.0.0
Date: 2026-07-22

## Implemented controls

- Six approved, machine-readable pharmaceutical/PV decision scenarios.
- Evidence extraction contract for Hits and Screening.
- Governed equivalence, common-salt, distinct-composition, presentation, administration-route, COI, and licence logic.
- Deterministic company-suspect assessment with decision trail, scenario provenance, prohibited conclusions, and manual-review controls.
- Product Master validation strengthened for auditable identity, composition, country, and licence status.
- Hits review displays the deterministic company-suspect conclusion rather than only the generic AI classification.
- AI audit persists the pharmaceutical knowledge version and full company-suspect assessments.
- Production release gate invokes the pharmaceutical scenario verifier.

## Approved executable scenarios

1. Acetaminophen matches configured paracetamol.
2. Diclofenac sodium matches configured diclofenac while preserving the salt.
3. Tretinoin does not match a retinyl-palmitate-only Product Master.
4. Unqualified Vitamin A remains unresolved when composition is ambiguous.
5. Paracetamol IV is not a company presentation when only non-IV paracetamol is configured.
6. A company paracetamol product administered intravenously remains a company suspect and triggers special-situation review.
7. A matched product without an active licence in the supplied COI is not confirmed as a company suspect for that COI.

## Verification

From `frontend`:

```powershell
npm install
npm run pharmaceutical:verify
npx tsc --noEmit
npm run lint
npm run build
```

The first four gates passed in the Codex workspace. The production build must be rerun on the supported local Node environment; the Codex Node 24 container lacks the `uv_resident_set_memory` API required by this Next.js build runtime.

## Governance boundary

The LLM extracts source-grounded evidence and semantic roles. The deterministic engine controls pharmaceutical equivalence, Product Master matching, presentation, COI/licence conclusion, and audit provenance. Missing or conflicting evidence produces manual review. New molecule relationships or clinically distinct salt exceptions must be added through an approved knowledge update, not agent code.
