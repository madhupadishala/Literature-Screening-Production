# Task 2.2 — Structured Clinical Rule Storage & Evaluation

**Implementation status: PARTIAL — CI in progress; NOT deployed to live Knowledge DB.**

## Implemented on integration branch
- `backend/knowledge/clinical_rule_store.py`: transactional, append-only SQLite rule revisions with stable IDs, version, domain, owner-agent, global/Nexus/tenant/client scope, jurisdiction, effective window, citations, statuses, and checksums.
- Only APPROVED revisions are resolvable; DRAFT/BLOCKED/SUPERSEDED fail closed.
- Deterministic allowlisted decision-table evaluator (no `eval` or executable user expressions).
- Scope-aware decision selection and tenant/client isolation.
- `tests/test_clinical_rule_store.py`: status gating, scopes, precedence, jurisdiction/date filters, revision immutability, missing evidence and malformed clauses.
- `.github/workflows/pv-agent-integration.yml`: run these tests in CI.

## Important limitations
- This is an engineering foundation, not production Neon DB migration. SQLite is used for isolated deterministic store tests; distributed transactional deployment/authorization is not done.
- Existing `KnowledgeRouter` is **not** yet wired to this store: router update was blocked by the environment. The agent graph has not adopted it.
- No Step 2.1 user clinical rules have been activated; the inventory is not a clinical decision-table compilation.
- User-defined client override precedence is draft only; enforce mandatory regulatory/non-overridable safety policy before any live override.
- CI status must be verified on the final commit; no clinical performance claims.
- Task 2.2 is **not closed** until integration, executable tests and DB environment are verified.

## Next remaining items within Task 2.2
1. Integrate scoped structured rule resolution into the existing Knowledge Router, keeping vector evidence retrieval separate.
2. Complete migration/storage on approved Nexus operational relational database with RBAC, transactional authorization and effective-date control.
3. Compile reviewed rule definitions into executable approved policy revisions, with tenant/client/region boundaries and non-overridable regulatory gates.
4. Verify CI and local runtime tests against selected integration commit.
5. Validate negative multi-tenant and non-approval release tests; publish completion evidence.

**Do not begin Task 2.3 until this task is genuinely closed.**
