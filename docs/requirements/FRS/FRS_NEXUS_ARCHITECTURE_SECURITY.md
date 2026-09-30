# FRS — Nexus Architecture and Security Enforcement

Document ID: FRS-NEXUS-SEC-001  
Version: 1.0-draft  
Status: Sprint 3 controlled draft  
Linked URS: URS-NEXUS-SEC-001

## 1. Tooling architecture
Sprint 3 uses:
- TypeScript strict compilation;
- ESLint;
- dependency-cruiser;
- Madge/baseline dependency analysis;
- npm audit;
- Gitleaks;
- dedicated Nexus security verification scripts;
- GitHub Actions;
- CodeRabbit independent review.

## 2. dependency-cruiser rules

### Blocking
1. `no-circular`
   - severity: error
   - applies across analyzed app/lib/scripts graph.

2. `nexus-platform-no-direct-vendor-ai-data-sdks`
   - severity: error
   - applies to Nexus/auth/RBAC/audit/evidence/platform and Nexus/auth API surfaces.
   - blocks direct dependencies on Qdrant, OpenAI, Redis clients, KafkaJS, Elasticsearch clients, LangChain/LangGraph package families.

3. `presentation-no-direct-database`
   - severity: error
   - blocks React presentation components from direct database/db adapter dependency.

### Transitional warnings
1. shared platform -> private module-domain coupling;
2. regulated module -> vendor SDK direct use;
3. orphan candidates.

Warnings are evidence/debt and must not be misrepresented as closed.

## 3. ESLint import rules
ESLint mirrors governed-vendor restrictions:
- error in shared Nexus platform/security surfaces;
- warning in legacy Literature/Safety module surfaces until those modules are reconciled.

This provides pre-CI developer feedback.

## 4. CI sequence
The normal frontend quality gate shall:
1. checkout;
2. configure supported Node version;
3. install locked dependencies;
4. install/run dependency-cruiser without changing the lockfile;
5. run architecture rules;
6. run `npm run security:audit`;
7. run lint;
8. run existing PV verification;
9. run Nexus tenant integrity;
10. run identity/workspace verification;
11. run security-boundary negative verification;
12. run production build.

Blocking failures stop qualification.

## 5. Dependency vulnerability remediation
Current controlled override strategy:
- Qdrant transitive `undici`: compatible patched 6.x line;
- Cheerio transitive `undici`: compatible patched 7.x line;
- affected brace-expansion branches: patched versions within compatible major branches.

The exact locked versions are controlled by `package-lock.json`; future maintenance shall re-evaluate whether overrides remain necessary.

## 6. Production principal hardening
`request-principal.ts` shall:
- permit signed legacy token resolution where still required for compatibility;
- permit trusted identity headers only when NODE_ENV is not production and `ALLOW_TRUSTED_IDENTITY_HEADERS=true`;
- permit demo principal only when NODE_ENV is not production and `ALLOW_DEMO_PRINCIPAL=true`;
- fail with authentication error when no permitted authenticated principal exists.

## 7. Scoped context codec
`context-token-codec.ts` shall:
- encode sessionId/userId/tenantId/workspaceId/environment/moduleKey;
- include issuedAt/expiresAt;
- HMAC-SHA256 sign the base64url payload;
- use constant-time signature comparison;
- reject malformed tokens;
- reject invalid enum values;
- reject expired tokens;
- reject materially future-issued tokens.

`context-token.ts` shall provide server-only secret access and expose create/validate functions.

## 8. Negative verification
`verify-nexus-security-boundaries.ts` shall test:
- valid token success;
- tenant payload tamper rejection;
- wrong signing secret rejection;
- expiry rejection;
- explicit cross-session binding in workspace guard;
- tenant re-resolution;
- workspace/module re-evaluation;
- non-production-only trusted-header/demo compatibility;
- opaque random identity tokens and SHA-256 storage;
- tenant/workspace composite relational constraints.

Later module-specific Hacker Gate tests shall add live resource IDOR/BOLA and workflow-state bypass.

## 9. Secret scan
Baseline/cleanup workflow shall checkout the exact PR head with full history so the Gitleaks comparison range can be resolved. Evidence is invalid if logs show zero bytes or a partial scan due to revision errors.

## 10. Evidence outputs
Expected outputs include:
- dependency-cruiser text/JSON;
- npm audit result;
- Gitleaks output/SARIF;
- identity-workspace verification output;
- security-boundary verification output;
- TypeScript/lint/build outcome;
- PR/CodeRabbit review record.

## 11. Acceptance mapping
- URS-SEC-001–010 → dependency-cruiser/ESLint/CI config
- URS-SEC-011–020 → principal/context/session/workspace guard
- URS-SEC-021–026 → package manifest/lock + npm audit
- URS-SEC-027–030 → Gitleaks workflow
- URS-SEC-031–037 → security-boundary verifier
- URS-SEC-038–048 → CI artifacts, traceability and review disposition
