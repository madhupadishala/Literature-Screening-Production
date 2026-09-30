# URS — Zero-Deviation Platform Cleanup and Capability Modernization

Document ID: URS-PLATFORM-CLEANUP-001
Status: Baseline
Scope: Literature Screening, Intake & Triage, L2A/Case Processing, Submissions, shared platform services
Change principle: Preserve intended business behavior while improving architecture, security, maintainability and platform capability.

## 1. Purpose

The system shall be cleaned and modernized without silent change to approved regulated workflow intent, safety-data meaning, role authority, audit semantics, evidence semantics, or validation-critical calculations.

## 2. Governing engineering principles

All changes shall satisfy:
1. Karpathy — understand first, smallest correct change, verify after change.
2. Ponytail — remove accidental complexity and avoid unjustified abstraction.
3. Architecture Guardian — conform to canonical platform boundaries.
4. Warpath — cover complete real workflows, failures and operational paths.
5. CodeRabbit — independent PR review with unresolved material findings blocking promotion.
6. Hacker Gate — adversarial security testing and remediation/retest.
7. Evidence Gate — requirement -> architecture -> code -> test -> security -> evidence -> release traceability.
8. Regulatory Knowledge Gate — authoritative regulator/harmonised source traceability, jurisdiction/version control and change-impact assessment.
9. Modular & Benchmark Completeness Gate — plug-and-play module integrity plus market/regulatory completeness benchmarking.

## 3. Canonical access model

URS-001 The system shall authenticate identity before tenant or client selection.
URS-002 The system shall support one authenticated identity accessing one or more authorized tenants.
URS-003 Each tenant shall contain zero or more client workspaces.
URS-004 Client workspaces shall be strictly bound to their parent tenant.
URS-005 Environment shall be explicit and controlled: PROD, UAT, TRAINING.
URS-006 Module access shall require tenant entitlement and workspace entitlement.
URS-007 User access shall require active tenant membership and active workspace membership.
URS-008 Module permissions shall be derived from authorized module roles and permissions.
URS-009 Context selection shall not itself grant authority.
URS-010 Protected requests shall revalidate authoritative access state server-side.
URS-011 Cross-tenant and cross-workspace access shall fail closed.
URS-012 Context changes shall be auditable.

## 4. Shared platform capability requirements

URS-020 PostgreSQL shall remain authoritative for regulated transactional state and governed configuration.
URS-021 Qdrant shall provide vector/semantic retrieval capability.
URS-022 Elasticsearch shall provide full-text and operational search/index capability.
URS-023 Redis shall provide ephemeral cache, lock, throttling and coordination capability only.
URS-024 Kafka shall provide asynchronous event transport between bounded platform/module capabilities.
URS-025 LangChain/LangGraph may provide AI orchestration behind internal platform interfaces.
URS-026 AI frameworks shall not own regulatory business rules.
URS-027 Infrastructure clients shall not be imported directly into regulated workflow domain logic.
URS-028 Shared internal interfaces shall abstract vector store, search index, cache, event bus, model access, embeddings, retrieval, reranking, document storage, audit and evidence.
URS-029 Infrastructure technologies shall be replaceable without rewriting regulated workflow logic.
URS-030 Technology-specific failures shall be isolated and observable.

## 5. AI and retrieval requirements

URS-040 The platform shall provide a centralized Model Gateway.
URS-041 The platform shall provide a centralized Embedding Service.
URS-042 The platform shall provide an authorized Retrieval Service.
URS-043 Retrieval shall be tenant/client/module scoped before vector or text search is executed.
URS-044 The platform shall support hybrid semantic + lexical retrieval where required.
URS-045 The platform shall support reranking where required.
URS-046 Retrieved sources used for regulated AI output shall be traceable.
URS-047 Model, model version, prompt/policy version, retrieved sources and user context shall be recorded where AI output affects regulated workflow.
URS-048 Human review requirements shall be explicit for regulated AI-assisted decisions.
URS-049 AI outputs shall not silently overwrite authoritative regulated records.

## 6. Literature Screening requirements

URS-060 Existing approved literature search, screening, review and evidence behavior shall be preserved unless separately changed under approved change control.
URS-061 Literature testing/search utility activity shall remain distinguishable from regulated PV workflow execution.
URS-062 Search execution evidence shall remain reproducible and auditable.
URS-063 Literature results promoted to downstream PV workflow shall retain source provenance.
URS-064 Patient-level extraction, RSI/label context and causality-support behavior shall remain source linked.
URS-065 Module logic shall consume shared identity, tenant, workspace, authorization, retrieval, audit and evidence services.

## 7. Intake and Triage requirements

URS-070 Existing intake capture, validation, duplicate assessment, follow-up and triage behavior shall be preserved.
URS-071 Intake data shall be tenant/client/workspace/module scoped.
URS-072 Duplicate detection shall not bypass authorized scope.
URS-073 Intake-to-case creation shall be transactional and auditable.
URS-074 Failed/partial intake processing shall be recoverable without hidden data loss.
URS-075 Module logic shall consume shared platform capabilities rather than duplicate them.

## 8. L2A / Case Processing requirements

URS-080 Existing case processing, QC, medical review, narrative, assessment, finalization and evidence behavior shall be preserved.
URS-081 Case versions shall remain attributable and auditable.
URS-082 Regulated state transitions shall be server enforced.
URS-083 Unauthorized state transitions shall fail closed.
URS-084 Finalized evidence shall be tamper evident/immutable according to governed design.
URS-085 Cross-client case access shall be impossible through direct identifier manipulation.

## 9. Submissions requirements

URS-090 Submissions shall be built/reconciled only on the canonical platform architecture.
URS-091 Submission preparation shall use authoritative finalized case data.
URS-092 Submission packaging shall be reproducible and evidence linked.
URS-093 Transmission/provider integration shall be abstracted from regulated submission domain logic.
URS-094 Retry/replay behavior shall be idempotent and auditable.
URS-095 Submission status shall not be inferred from transport success alone when regulator acknowledgement is required.

## 10. Audit and evidence

URS-100 Security-sensitive and regulated workflow actions shall create attributable audit records.
URS-101 Audit records shall include actor, tenant, workspace, module, environment, action, outcome and timestamp where applicable.
URS-102 Evidence packages shall reference the exact source inputs/configuration used.
URS-103 Cleanup shall not erase historical regulated evidence.
URS-104 New platform services shall emit evidence sufficient to diagnose failures and reproduce material decisions.

## 11. Security

URS-110 Secrets shall not be committed to source control.
URS-111 Authentication and session mechanisms shall resist replay, fixation and browser-controlled privilege authority.
URS-112 Authorization shall resist IDOR/BOLA and horizontal/vertical privilege escalation.
URS-113 Inputs shall be validated against injection and malicious payload classes appropriate to the interface.
URS-114 File/document ingestion shall be constrained by type, size, provenance and scanning policy.
URS-115 Rate limiting and abuse controls shall exist at suitable boundaries.
URS-116 Service-to-service credentials shall use least privilege.
URS-117 Security findings shall be severity classified, remediated and retested before release.

## 12. Code quality and maintainability

URS-120 TypeScript strict mode shall remain enabled.
URS-121 Production code shall pass linting and type checks.
URS-122 Dead code, unused exports/dependencies and unjustified duplication shall be removed when proven safe.
URS-123 Circular dependencies shall be eliminated or explicitly justified and controlled.
URS-124 Architecture dependency rules shall be machine enforced.
URS-125 New abstractions shall have a demonstrated cross-cutting need.
URS-126 Cleanup changes shall be behavior preserving unless separately approved.

## 13. Benchmark and evidence requirements

URS-130 The current repository shall have an immutable BEFORE benchmark.
URS-131 AFTER results shall be compared to BEFORE results.
URS-132 Benchmarks shall include lint, type errors, build, vulnerabilities, unused code, duplication, dependency cycles, architecture violations, secret findings, test results and security boundary results.
URS-133 Every remediation shall identify requirement, finding, code change, verification and residual risk.
URS-134 Production readiness shall not be claimed solely because a build succeeds.

## 14. Clean export requirements

URS-140 The original repository shall remain the historical provenance repository.
URS-141 The clean repository shall be created only from an exact qualified cleanup release-candidate commit.
URS-142 The clean export shall exclude Git history, secrets, build artifacts, local files, obsolete experiments and proven dead code.
URS-143 The clean repo shall include source, approved migrations, tests, CI/CD, architecture, verification scripts, environment templates and operational documentation.
URS-144 The clean repo shall contain PROVENANCE.md with source repo, branch, exact commit, migration head, qualification result and archive hash.
URS-145 The clean repository's first commit shall represent the verified clean baseline.

## 15. Acceptance

The cleanup program is accepted only when all applicable URS items are traced to implementation and objective evidence and every mandatory applicable gate has passed. Formal disposition may document an approved non-applicable gate or an external dependency/exception that does not represent a failed mandatory control; it shall not waive a failed mandatory gate.
