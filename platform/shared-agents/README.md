# Nexus Shared Agent Platform — consolidation workspace

This directory is a **non-disruptive source consolidation snapshot**, NOT a deployable, integrated agent registry.

- Original source paths remain unchanged; no Nexus production imports or routes are modified.
- Sources: main, feat/event-extraction-agent, feat/listedness-faers-gold-v1.
- Source code is grouped under legacy-backend/, frontend/, recovered/, and candidates/.
- Files are copied by their original Git blob hashes. See SOURCE_MANIFEST.json.
- Passing historical package tests do not establish tests passing from this relocated directory.
- Do not enable agents or delete original locations until module imports, contract adapters, scoped knowledge retrieval, end-to-end tests and regulatory review pass.

## Target architecture

Next migration phase: platform/shared-agents/{contracts,registry,orchestration,adapters,agents,tests,validation}.

Module integrations must depend on a **versioned shared-agent service interface** (not a Git branch). Use tenant/client/workspace scoping, source-evidence offsets, model/knowledge provenance, HITL states and durable audit records. Register capabilities explicitly and fail closed when not ready. Finish migration through a reviewed PR to main; protect main and use feature branches for ongoing work.

## Consolidation acceptance gates

1. Compare inventory and expected 21-agent functional roster (do not double count overlapping specialists).
2. Select one canonical implementation per agent; retire duplicates after review.
3. Add versioned input/output schemas, adapter and dependency graph for each agent.
4. Run unit, contract, cross-agent, multi-tenant security and real source E2E tests.
5. Clinical expert adjudication, knowledge licensing, monitoring and gated release.
