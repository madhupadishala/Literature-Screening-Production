# Shared PV agent review corrections

This change combines the three reviewed components on a correction branch. It uses the actual drug-role implementation from `feat/drug-role-agent-v1`; it does not substitute the separately reconstructed ZIP.

## Findings and disposition

| Finding | Correction |
|---|---|
| Chronic metformin classified UNKNOWN | Concomitant signal handles receiving ... chronically; original regression passes. |
| Repeated mentions shift evidence | Store actual sentence offsets at extraction time; never reconstruct offsets from the first drug occurrence. Negation evidence also uses exact original text. |
| UNKNOWN ownership bypasses review | Unknown ownership forces human review; empty extraction also requires review. |
| Lowercase fallback misses aspirin | Case-insensitive suffix discovery plus explicit common generic aliases; fallback remains limited, not full NER. |
| Chroma missing / imports crash | Pinned agent runtime manifest, included from root requirements; lazy retrieval initialization and explicit unavailable error. Clean runtime import tested. |
| Retrieval fields only echoed | Client, knowledge types, agent scope, jurisdiction and as-of filtering now reach retrieval; tenant/client filtering occurs before similarity search and is checked again afterward. |
| Weak Product Master scope | Client metadata must match the selected client (or explicitly GLOBAL); missing client metadata is excluded. Empty names cannot match everything. Effective dates are checked when requested. |
| Rule versions lost | Preserve metadata, index version/effective dates/scopes, stamp retrieval component version and input snapshot digest. |
| Rule IDs collide across tenants | Vector IDs include tenant/client namespace. |
| No response validation | Seriousness response validates schema, identity/hash echoes, confidence, audit reference and decision/route consistency; sensitive upstream error bodies are not reflected. Shared client also validates envelopes. |
| No tenant/workspace in seriousness | Tenant, client and workspace are required, generated from the authorized server context and checked in responses. |
| No caller / drug service boundary | Authenticated case-scoped API dispatch calls seriousness/shared clients. Python public WSGI service calls the Nexus drug wrapper; configured causality workers receive context through the KB adapter. |
| No audit persistence | Shared service commits tenant/client/workspace/request/input/output audit records before returning; failed audit rejects response; duplicate request ID conflicts. |
| No Python agent CI | New CI covers feat/feature/fix branches and PRs, installs pinned runtime, runs agent regressions and typed client contract tests. |
| Suspicious model identifiers | Removed unverified internal model labels as asserted public API names. Approved provider model IDs must be configured and verified before qualification. |
| External causality provenance absent | Manifest references exact external package SHA-256 and explicitly states NOT_APPROVED; no qualified source commit is invented. |

## Shared boundary and setup

Common fields: tenant_id, client_id, workspace_id, request_id, case_id, input_sha256, confidence, route, knowledge_version and audit_id. Input hash is SHA-256 of exact UTF-8 narrative bytes. Evidence offsets count Unicode code points, not UTF-8 bytes or UTF-16 code units. Drug-role service responses use `nexus.pv-agent/1` and carry evidence_spans plus result. Seriousness retains its richer typed decision contract with the same identity/audit fields.

The browser API is `/api/safety/cases/[caseId]/agents/[agent]` for `seriousness`, `drug-role`, or `causality`. It authorizes the selected Case Processing workspace and case, derives client_id from the client workspace UUID, and rejects body-supplied scope or gold/reference fields. Literature/Intake can reuse the server client/service contract; no new UI controls or automatic assessment writes are introduced.

Install `requirements-agents.txt` and run the WSGI factory `backend.services.pv_agents.service:create_application` under the organization's production WSGI host. Configure `NEXUS_PV_SERVICE_TOKEN_SCOPES` as a secret JSON map from issued service tokens to explicit `{tenant_id, client_id, workspace_id}` scope lists. Configure `NEXUS_PV_AUDIT_DB` to an existing parent directory on a durable protected volume. Set `NEXUS_PV_AGENTS_ENABLED=true` only for the approved service environment. The application's three agent feature flags remain false by default.

The factory registers the drug-role worker only. External seriousness/causality decision engines require host registration/configuration and live qualification; an absent worker returns 503/HITL. The causality KB adapter is not a substitute for the actual decision engine. The seriousness external service must implement the hardened workspace/hash/response contract before its frontend flag can be enabled.

## Required knowledge migration

Rebuild the vector index from reviewed documents with explicit `client_id`, `agent_scope`, `country_scope`, `effective_date`, `expiry_date` and `version`. Client-independent tenant rules must explicitly use client_id GLOBAL. Global rules remain GLOBAL tenant scope. Do not infer client IDs or dates for unqualified legacy data. Missing client metadata, missing requested jurisdiction/effective dates and absent indexes fail closed. Retire the legacy unnamespaced index through an approved migration; reindexing is not run against production by this PR. Filtering may reduce retrieved context until this migration is complete.

Client Product Master records must carry client IDs matching authorized Nexus client workspace UUIDs, or approved GLOBAL tenant-wide applicability. Product Master absence continues to mean UNKNOWN ownership, not NON_COMPANY. Snapshot hashes are evidence digests, not proof of clinical approval.

## Verification and remaining release gates

26 Python regressions, 11 TypeScript contract tests and TypeScript compilation pass. Pinned Chroma 1.5.9 installation/import passes. A local HTTP test exercises authentication → scoped Product Master → real drug-role engine → durable audit → response. Tests use controlled mocks/fixtures and temporary audit databases; they are not a blinded clinical benchmark. The fallback NER is conservative, confidence is heuristic, and no 100% accuracy claim is made.

Not completed by these code corrections: external live-service alignment/model verification, production deployment, production audit-volume backup/access/immutability qualification, full NER/terminology qualification, clinical expert review and formal release approval. All service outputs remain HITL proposals; flags remain disabled.
