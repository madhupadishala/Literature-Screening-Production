# Seriousness synthetic validation scenarios — DRAFT

Run `node frontend/scripts/verify-seriousness.mjs` with Node 24 or a TypeScript-capable runner. The 32 scenarios are engineering fixtures, not real cases or an independently reviewed clinical gold set. Claims are supplied as test inputs; quote existence does not validate clinical interpretation. No recall or precision claim is made.

Verification includes all six criteria, conflict preservation, source-span rejection, cross-patient rejection, context flags, incomplete source coverage, reporter seriousness preservation, provider failure and pre-provider tenant/client boundaries. Existing safety engine regression and strict TypeScript checks must also pass.
