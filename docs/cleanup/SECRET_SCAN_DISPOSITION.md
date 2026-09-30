# Secret Scan Finding Disposition — Sprint 0–3

Document ID: SEC-GITLEAKS-DISP-001  
Status: Pending final clean rerun  
Scope: cleanup branch full-history and governed working-tree Gitleaks findings.

## 1. Purpose

Document the evidence-based classification of findings produced by the first trustworthy full-history and working-tree Gitleaks scans. This document does not waive a real secret. A real credential, token, key, or externally usable secret would require removal/rotation/revocation and a clean rescan.

## 2. Historical finding classification

Gitleaks identified two historical findings in:

`frontend/scripts/verify-nexus-sprint3.ts:116`

Both findings refer to the deterministic verification value:

`partner-msg-8842`

Context: the value is assigned to an `idempotencyKey` in a synthetic verification fixture. It is not an API credential, authentication token, encryption key, password, or external service secret.

Disposition: **FALSE POSITIVE — deterministic test fixture**.

Control: the Gitleaks policy may suppress only the exact known fixture value/pattern for the applicable generic-key rule. Whole-file, whole-rule, or broad entropy suppression is prohibited.

## 3. Generated working-tree finding classification

The initial working-tree scan also detected generated Next.js build material under `frontend/.next/**`, including preview/signing/encryption values emitted by the local build.

These paths are generated artifacts, are not governed source, and are excluded from the clean source export.

Disposition: **GENERATED BUILD ARTIFACT — not governed source**.

Control: only generated/dependency paths such as `.next/`, `node_modules/`, benchmark output, coverage, dist/build output are excluded. Source directories are not globally excluded.

## 4. Qualification requirement

This disposition is valid only when a subsequent controlled scan demonstrates:

- incremental PR scan: clean;
- full-history scan using the governed configuration: exit 0;
- governed working-tree/source scan using the governed configuration: exit 0;
- no broad allowlist capable of hiding arbitrary source secrets.

Until those conditions are met, the Hacker Gate remains open.

## 5. Required response to future findings

Future source findings shall be treated as real until evidence proves otherwise. For a real exposed secret:

1. revoke/rotate it;
2. remove it from current source;
3. assess historical exposure;
4. determine whether history rewrite is required;
5. rescan;
6. document incident/remediation evidence.

No finding may be dismissed merely because it appears in test or development code.
