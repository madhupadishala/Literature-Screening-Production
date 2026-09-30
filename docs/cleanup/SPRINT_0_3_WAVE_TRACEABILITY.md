# Sprints 0–3 Wave Traceability and Qualification Record

Document ID: CLEANUP-WAVE-0-3-001  
Branch: `cleanup/zero-deviation-baseline-20260930`  
Status: QUALIFICATION IN PROGRESS  
Scope: Sprint 0 Baseline & Governance; Sprint 1 Regulatory Knowledge Foundation; Sprint 2 Nexus Core; Sprint 3 Architecture & Security Enforcement.

## 1. Status vocabulary

- **IMPLEMENTED** — code/document/configuration exists on the cleanup branch.
- **VERIFIED** — executable evidence has passed on the applicable branch head.
- **TRANSITIONAL** — intentionally retained compatibility/debt, explicitly visible and scheduled for a later module sprint.
- **CATALOGUED** — official regulatory source has been registered, but full source acquisition/chunking/embedding/approval is not being claimed.
- **BLOCKED** — qualification cannot proceed without remediation/owner/external dependency.

## 2. Sprint 0 — Baseline & Governance

| Requirement / objective | Implementation / evidence | Status |
|---|---|---|
| Preserve main/current behavior before cleanup | Dedicated cleanup branch; no main rewrite | VERIFIED |
| TypeScript baseline | `tsc --noEmit` in Cleanup Baseline Benchmark | VERIFIED |
| Production build baseline | `npm run build` baseline evidence | VERIFIED |
| Lint baseline | ESLint baseline captured | VERIFIED |
| Dependency vulnerability baseline | npm audit baseline; findings captured before remediation | VERIFIED |
| Dead/unused candidates | Knip identifies ~150 candidates; no blind deletion | VERIFIED |
| Duplication baseline | jscpd: 308 clones, 4,611 duplicated lines (3.89%), 23,044 duplicated tokens (4.36%); run 36664295714 | VERIFIED |
| Circular dependency baseline | Madge/dependency-cruiser evidence | VERIFIED |
| Architecture dependency graph | dependency-cruiser scans >600 modules / >1,200 dependencies | VERIFIED |
| Secret scan | Incremental PR scan clean; full-history/governed working-tree scan required | BLOCKED pending classification of 2 historical and current working-tree findings from run 36673592643; generated/dependency paths are being excluded without allowlisting governed source |
| Existing Literature/Intake/L2A behavior | existing PV/Nexus verification scripts | VERIFIED |
| Zero-deviation baseline report | `docs/cleanup/BASELINE_REPORT.md` | IMPLEMENTED |

## 3. Sprint 1 — Regulatory Knowledge Foundation

### 3.1 Controlled documents

| Document | Status |
|---|---|
| `docs/pv-knowledge/REGULATORY_SOURCE_REGISTER.md` | IMPLEMENTED |
| `docs/requirements/URS/URS_REGULATORY_KNOWLEDGE.md` | IMPLEMENTED |
| `docs/requirements/FRS/FRS_REGULATORY_KNOWLEDGE.md` | IMPLEMENTED |
| `docs/user-guides/USER_GUIDE_REGULATORY_KNOWLEDGE.md` | IMPLEMENTED |
| `knowledge/Regulatory/regulatory-source-catalog.json` | IMPLEMENTED |

### 3.2 Regulatory authority coverage

| Authority/source family | Current status | Notes |
|---|---|---|
| EMA / GVP | CATALOGUED | Full current applicable modules/addenda/annexes must be acquired, checksummed, reviewed and approved before claiming corpus completeness. |
| ICH E2 family | CATALOGUED | Includes planned E2A/E2B(R3)/E2C(R2)/E2D(R1)/E2E/E2F and implementation material. |
| CDSCO | CATALOGUED | India primary jurisdiction pack planned. |
| PvPI / IPC | CATALOGUED | India operational/source material planned. |
| FDA | CATALOGUED | Postmarketing/E2D(R1)/electronic reporting material planned. |
| MHRA | CATALOGUED | GB/NI applicability must remain explicit. |
| Health Canada | CATALOGUED | Current guidance + notices/clarifications. |
| TGA | CATALOGUED | Sponsor PV responsibilities. |
| PMDA/MHLW | CATALOGUED | Controlled translation/original-source handling required where applicable. |
| WHO | CATALOGUED | Normative status shall remain distinct from binding jurisdictional requirements. |

### 3.3 Knowledge engine

| URS area | Implementation | Status |
|---|---|---|
| File discovery | `lib/knowledge/ingestion/knowledge-file-discovery.ts` | IMPLEMENTED |
| Global regulator taxonomy | `RegulatoryAuthority` expanded to EMA/FDA/MHRA/PMDA/MHLW/ICH/CIOMS/CDSCO/PVPI/IPC/Health Canada/TGA/WHO/EudraVigilance | IMPLEMENTED |
| Checksums | existing ingestion SHA-256 | IMPLEMENTED |
| Structure-aware parsing/chunking | document intelligence + section-aware chunker | IMPLEMENTED |
| Chunk hashes/citations | existing chunk model | IMPLEMENTED |
| Embeddings | existing embedding contract/provider | IMPLEMENTED |
| Controlled semantic/keyword/hybrid retrieval | existing controlled knowledge service | IMPLEMENTED |
| Vector capability | Qdrant types/client capability exists | IMPLEMENTED / architecture migration later |
| Source approval/version lifecycle | partially represented by current controlled repository | TRANSITIONAL |
| Full current regulator corpus downloaded/chunked/embedded | not claimed | CATALOGUED / FUTURE ACQUISITION |
| Jurisdiction/version/effective-date filtering end-to-end | metadata model partially supports it; requires full production implementation/validation | TRANSITIONAL |

**Evidence rule:** Sprint 1 establishes the controlled regulatory-knowledge foundation. It does **not** claim that every regulator document has already been copied into Git or approved for production RAG.

## 4. Sprint 2 — Nexus Core

### 4.1 Requirement-to-implementation mapping

| Requirement group | Implementation | Status |
|---|---|---|
| Identity-first login | `verifyIdentityCredentials`, `/api/auth/identity` | IMPLEMENTED |
| Durable sessions | `nexus_identity_sessions`, `identity-session-service.ts` | IMPLEMENTED |
| Bearer secret hashing | random 256-bit token, SHA-256 hash at rest | IMPLEMENTED |
| Tenant memberships after identity | identity API tenant list + `resolveTenantForIdentity` | IMPLEMENTED |
| Client workspaces | migration 033 + workspace access service | IMPLEMENTED |
| Environment scope | PROD/UAT/TRAINING | IMPLEMENTED |
| Tenant module entitlement | existing migration 022 + workspace subset | IMPLEMENTED |
| Workspace membership | migration 033 | IMPLEMENTED |
| Workspace module entitlement | migration 033 | IMPLEMENTED |
| Module role | migration 033 | IMPLEMENTED |
| Permission revalidation | workspace guard + tenant permission + module role | IMPLEMENTED |
| Scoped context | signed short-lived context, bound to identity session | IMPLEMENTED |
| Audit/access history | scoped audit columns + workspace history | IMPLEMENTED |
| Plug-and-play module registry | Submissions/PV Documentation explicit; Case Processing no hard Intake entitlement dependency | IMPLEMENTED |
| Existing module route migration to new guard | happens per module sprint | TRANSITIONAL |
| Legacy tenant-first login removal | retained compatibility-only until module reconciliation | TRANSITIONAL |

### 4.2 Controlled documents
- `docs/requirements/URS/URS_NEXUS_CORE.md`
- `docs/requirements/FRS/FRS_NEXUS_CORE.md`
- `docs/user-guides/USER_GUIDE_NEXUS_CORE.md`

### 4.3 Verification
- `npm run nexus:identity-workspace:verify`
- database/migration static integrity checks
- identity-first/session/context static verification
- full CI/build qualification on current head required before GREEN.

## 5. Sprint 3 — Architecture & Security Enforcement

| Requirement group | Implementation / evidence | Status |
|---|---|---|
| Circular dependency block | dependency-cruiser `no-circular` error | IMPLEMENTED |
| Nexus/platform direct vendor SDK block | dependency-cruiser + ESLint error | IMPLEMENTED |
| Presentation→DB bypass block | dependency-cruiser error | IMPLEMENTED |
| Legacy regulated module vendor coupling | warning until module reconciliation | TRANSITIONAL |
| Production header identity trust | disabled; non-production explicit opt-in only | IMPLEMENTED |
| Production demo principal | disabled; non-production explicit opt-in only | IMPLEMENTED |
| Context tamper/expiry test | `verify-nexus-security-boundaries.ts` | IMPLEMENTED |
| Cross-session context replay protection | sessionId binding + verification | IMPLEMENTED |
| Dependency vulnerability remediation | compatible transitive overrides + lockfile | VERIFIED when current-head npm audit passes |
| Secret scanning | exact PR head/full history + governed source-tree Gitleaks | BLOCKED until full-history findings are classified/remediated and governed source-tree scan is clean |
| Architecture CI | normal quality gate | IMPLEMENTED |
| CodeRabbit | PR #80 independent review/disposition | PENDING QUALIFICATION |

### Controlled documents
- `docs/requirements/URS/URS_NEXUS_ARCHITECTURE_SECURITY.md`
- `docs/requirements/FRS/FRS_NEXUS_ARCHITECTURE_SECURITY.md`
- `docs/user-guides/USER_GUIDE_NEXUS_SECURITY_ADMIN.md`

## 6. Nine-gate disposition for this wave

| Gate | Current disposition |
|---|---|
| Karpathy | Small additive migration/refactor; legacy compatibility retained until characterized module migration. |
| Ponytail | Existing workspace foundation reused; no duplicate platform stack introduced. |
| Architecture Guardian | Machine rules added; platform/module hierarchy formalized. |
| Warpath | Existing PV workflows retained; new identity/context negative verification added; live module IDOR continues in module sprints. |
| CodeRabbit | PENDING current-wave review/disposition. |
| Hacker Gate | Foundation negative tests implemented; module-resource adversarial testing continues in module sprints. |
| Evidence Gate | This record + CI artifacts + baseline report; current-head CI must be green. |
| Regulatory Knowledge Gate | Controlled source register/catalog + detailed URS/FRS/User Guide; full regulator corpus acquisition is not overstated. |
| Modular & Benchmark Completeness | Plug-and-play entitlement architecture implemented; module-specific market completeness occurs in Sprints 4+. |

## 7. Known transitional debt carried forward

1. Existing module routes are not automatically considered migrated to the new workspace guard.
2. Legacy tenant-first auth remains compatibility-only until affected modules are reconciled.
3. Some regulated module code may still import vendor SDKs directly; warning becomes blocking as each module moves behind shared interfaces.
4. The ~150 Knip unused-file candidates require classification before deletion.
5. Existing lint warnings and Next.js knowledge filesystem tracing warning require controlled cleanup.
6. Full public regulator source acquisition/chunking/embedding/approval is not complete merely because sources are catalogued.
7. Live database migration rehearsal and environment deployment evidence are separate from static migration/code qualification.

## 8. Owner/external assistance policy

No owner action is required to continue source-code qualification.

Owner/regulatory assistance is required later only when:
- a regulator/standards source requires licensed credentials or restricted redistribution/access;
- a regulatory interpretation cannot be resolved from authoritative text;
- a production database migration/deployment approval is needed;
- a business decision changes supported module combinations or jurisdiction scope.
