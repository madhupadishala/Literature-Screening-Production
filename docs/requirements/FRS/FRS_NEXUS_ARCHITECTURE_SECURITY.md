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


## 12. Detailed functional requirement matrix

| FRS ID | Linked URS | Detailed functional requirement | Verification |
|---|---|---|---|
| FRS-SEC-001 | URS-SEC-001–002 | Architecture policy shall be executable in CI. Circular dependencies in the governed app/lib/scripts graph shall be severity=error and block the normal quality gate. | dependency-cruiser + Madge |
| FRS-SEC-002 | URS-SEC-003 | Nexus/auth/RBAC/audit/evidence/platform code shall be blocked from direct imports of governed vendor AI/vector/cache/event/search SDKs. | dependency-cruiser + ESLint |
| FRS-SEC-003 | URS-SEC-004 | React presentation components shall be blocked from importing database/db adapters directly. | dependency-cruiser |
| FRS-SEC-004 | URS-SEC-005–006 | Shared-platform→private-module and legacy-module→vendor edges shall remain warning-visible while characterized debt exists; each module sprint shall promote the applicable rule to error only after safe migration evidence exists. | dependency report / promotion record |
| FRS-SEC-005 | URS-SEC-007–010 | Architecture checks shall run on affected PRs and release candidates; warning debt shall be reported distinctly from blocking violations. | GitHub Actions evidence |
| FRS-SEC-006 | URS-SEC-011–013 | Production request-principal resolution shall reject arbitrary trusted identity headers and demo fallback. Non-production compatibility shall require explicit opt-in environment flags. | security-boundary verifier |
| FRS-SEC-007 | URS-SEC-014 | Identity bearer tokens shall be generated from cryptographically secure randomness and persisted only as hashes. | identity-workspace verifier |
| FRS-SEC-008 | URS-SEC-015–018 | Context tokens shall be signed, enum/timestamp validated, expiration checked, session-bound and tamper resistant. | token codec tests |
| FRS-SEC-009 | URS-SEC-019–020 | Authorization shall re-read current membership/entitlement/role state and fail closed on cross-tenant/workspace selector manipulation. | negative authorization verifier |
| FRS-SEC-010 | URS-SEC-021–026 | The locked dependency tree shall be scanned at high severity in the blocking quality gate. Compatible patched versions/overrides shall be preferred; lockfile/manifests shall remain consistent and audit exit codes shall not be suppressed. | npm audit / quality gate |
| FRS-SEC-011 | URS-SEC-027–030 | Secret scanning shall cover the PR change range and a separate full-history/governed-working-tree baseline. A partial/zero-byte scan shall fail evidence acceptance. Confirmed secrets shall trigger removal and rotation/investigation. | Gitleaks incremental + baseline |
| FRS-SEC-012 | URS-SEC-027–030 | Secret-scan exclusions shall be narrow and limited to generated/dependency artifacts or demonstrably synthetic fixtures; exclusions shall be version-controlled and reviewable. | `.gitleaks.toml` review |
| FRS-SEC-013 | URS-SEC-031–035 | Security tests shall include valid/tampered token, wrong secret, expiry, cross-session replay, tenant/workspace relational integrity and production fail-closed compatibility paths. | `nexus:security-boundaries:verify` |
| FRS-SEC-014 | URS-SEC-036–037 | Module sprints shall extend the Hacker Gate to real-resource IDOR/BOLA, state-transition bypass, mass assignment and hostile payload/file scenarios; those tests shall be executable CI evidence. | future module security suites |
| FRS-SEC-015 | URS-SEC-038–041 | CI shall retain/reproduce architecture, dependency, secret-scan and security-boundary evidence attributable to the exact checked-out commit; traceability shall map test evidence to URS/FRS. | benchmark artifacts + traceability |
| FRS-SEC-016 | URS-SEC-042–043 | Material CodeRabbit findings shall be verified, fixed/dispositioned and re-reviewed; Sprint 3 cannot be green while the normal quality CI is failing or CodeRabbit has unresolved material findings. | PR review + CI status |
| FRS-SEC-017 | URS-SEC-044–047 | Enforcement shall be incremental rather than big-bang: proven platform boundaries become blocking immediately; characterized module debt stays warning-visible until its module migration; every warning→error promotion shall be evidenced. | dependency config history |
| FRS-SEC-018 | URS-SEC-048 | Legacy auth paths shall be removed only after all dependent routes use identity/workspace guards and module regression/security evidence is green. | module sprint evidence |
| FRS-SEC-019 | URS-SEC-001–048 | CI actions used for security/evidence shall use controlled versions/hashes where practical; generated build artifacts shall not be misclassified as governed source during secret scans. | workflow/config review |
| FRS-SEC-020 | URS-SEC-001–048 | Every Sprint 3 blocking control shall fail closed: tool execution errors, malformed security inputs or missing required runtime secrets shall not silently downgrade to an allow decision. | quality/security negative tests |

## 13. Security acceptance thresholds

- TypeScript errors: 0.
- Blocking architecture violations: 0.
- Circular dependencies: 0.
- High-severity dependency vulnerabilities in the normal release quality gate: 0 unless a formally approved exception is explicitly represented outside a green gate.
- Confirmed source-controlled secrets: 0.
- Production trusted-header/demo authentication authority: 0.
- Known successful cross-tenant/workspace authorization bypasses: 0.
- Unresolved material CodeRabbit security/architecture findings at qualification: 0.
- Warning-level transitional architecture debt may remain only when explicitly mapped to a later module sprint and must not be described as remediated.
