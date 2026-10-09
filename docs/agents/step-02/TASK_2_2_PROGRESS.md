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


## Recovery execution record (five ordered items)

1. **Legacy dechallenge tests:** COMPLETED AND CI-VERIFIED. Corpus labels updated to the new expert-dictated taxonomy (unknown/not_applicable), and withdrawal-only assertion corrected. PV Specialist Agent Integration workflow passed on commit `85d42e4b73ce6ac1a1b980d0336a4e9e5c5103b6` (run 37977697695).
2. **Knowledge Router integration:** IMPLEMENTED AS OPT-IN SCOPED EVALUATION, VERIFIED VIA CI. `KnowledgeRouter.evaluate_clinical_rule` explicitly accepts a `ClinicalRuleStore`; existing vector-retrieval logic unchanged. Tests verify correct scope and cross-client denial. PV Specialist Agent Integration passed at commit `578512f6bbe28cc2a14bf40a454fa596a220fcc4` (run 37977778386). Existing live specialist graph does not yet invoke the rule-store evaluator automatically; later agent adapter/integration scope applies.
3. **Persistent rule storage:** SQLite-backed append-only transactional prototype implemented and passing tests; PostgreSQL migration staged at `backend/knowledge/migrations/20261009_nexus_clinical_rule_revisions.sql`. An attempt to create an isolated validation branch in Neon project `clinixai-validation-db` failed with **branches limit exceeded (HTTP 422)**. No live database migration was executed; schema requires authz/RLS, approval and regulated-policy non-override hardening before deployment.
4. **35-rule import:** `ClinicalRuleStore.import_inventory_drafts` imports the complete Step 2.1 inventory as non-executable DRAFT records with idempotent rerun behavior. Regression test confirms 35 records inserted and 35 recognized on second import. The 35 have NOT been imported into the live Neon database, and none are activated. Their text must NOT be mistaken for executable clinical tables.
5. **Final verification:** PV Specialist Agent Integration CI SUCCESS on commit `578512f6bbe28cc2a14bf40a454fa596a220fcc4` including the rule store/import/router regressions. Broader CI and latest migration commit are NOT claimed to have full release green gates. No production deployment.

**Overall Task 2.2:** PARTIAL, NOT CLOSED. Remaining blocking gates: approved isolated Neon branch or other safe database target; PostgreSQL migration validation; row-level security/role enforcement; controlled policy approval/activation and coverage tests; final integrated CI evidence on the deployment commit. No changes to production clinical decision logic were made in this recovery.


## 2026-10-10 — RLS, approval control and PostgreSQL verification

- Security migration committed: `backend/knowledge/migrations/20261010_nexus_clinical_rule_security.sql` and executed on Neon project `clinixai-validation-db`, branch `wave3-033-039-rehearsal`, database `neondb` ONLY.
- Both `nexus_clinical_rule_revisions` and `nexus_clinical_rule_principals` have **ENABLE RLS** and **FORCE RLS** in PostgreSQL catalogs.
- `nexus_clinical_rule_reader` (NOLOGIN, NOBYPASSRLS) is SELECT-only and does not possess INSERT, UPDATE or clinical approval function execution rights.
- Reader access requires a matching role-to-tenant/client principal mapping, is limited to APPROVED rules, and principal mapping visibility itself is restricted.
- `nexus_clinical_rule_approver` (NOLOGIN, NOBYPASSRLS) may execute an audited SECURITY DEFINER approval function; it rejects missing rationale and placeholder-only decision tables.
- DB query evidence: 35 total rules, 35 DRAFT, 0 APPROVED, 0 approval audit entries, 0 principal rows; switched restricted-reader role returned zero clinical rows and zero principal rows; reader approval privilege false, approver privilege true. No actual user clinical rules approved.
- `backend/knowledge/postgres_clinical_rule_store.py` provides parameterized, scoped PostgreSQL resolution and explicitly rejects database credentials with BYPASSRLS. Existing `KnowledgeRouter.evaluate_clinical_rule` accepts this adapter. The optional `tests/test_postgres_clinical_rule_store.py` is included in the specialist CI workflow.
- Specialist integration CI succeeded for security hardening commit `9a616eae6cbf9014414660c819fb64f1deeb7d4b`, workflow run `37980590253`.
- **Remaining limitation:** application-level PostgreSQL smoke tests require `NEXUS_CLINICAL_RULE_TEST_DSN` for a legitimate scoped non-owner runtime user. No such connection has been provisioned into CI, therefore those tests skip rather than exercise the live database. PostgreSQL role-scoped data-access checks were run directly through Neon. Do NOT claim complete application-to-database qualification or production release from this evidence.
- **Still required for full closure:** scoped runtime LOGIN provisioning and authenticated principal mapping, database-backed application integration smoke tests in CI (must execute, not skip), validation of approved synthetic test decision tables and client isolation under separate roles, as well as a final full quality-gate review. Existing Nexus production settings remain unchanged.

**Status:** Implemented security foundation and direct database tests; Task 2.2 remains open pending credentials and executed application-level DB tests.
