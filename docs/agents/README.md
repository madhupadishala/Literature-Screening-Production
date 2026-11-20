# Nexus PV Agents — Live Status Contract

This folder is the machine-readable discovery point for automated checks by ChatGPT, Kimi, Claude, CodeRabbit, or another reviewer.

## Canonical inspection order

1. Read `docs/agents/agent-inventory.json` on the **branch being inspected**.
2. Verify every `git_source_path` exists at that exact ref. Files from uploaded ZIPs are **not Git files** unless independently committed.
3. Examine agent implementation, imports, executable entrypoint and typed input/output contracts.
4. Verify KnowledgeRouter, LangGraph and external adapters with code and runnable tests (do not infer from a class name).
5. Inspect CI results, runtime environment, server startup and Vercel build logs. Git presence does not prove deployment.
6. Independently validate the clinical benchmark and qualification evidence. Unit tests do not prove clinical safety.

## Status definitions

- `available_in_uploaded_package_not_committed`: source was inspected in a user upload, **not present** on this branch.
- `prior_work_requires_verification`: work has been discussed or located in the Nexus repo but functionality and wiring must be checked.
- `source_committed`: implementation file is present in Git, imports and syntax not yet necessarily verified.
- `runnable`: executable entrypoint and tests pass in an isolated environment.
- `nexus_integrated`: shared schema, approved KB adapter, tenant/client isolation and orchestration contracts pass integration tests.
- `clinically_qualified`: benchmark, expert review, traceability and clinical release gates approved.
- `deployed`: a particular release SHA has been built, activated and checked at the running endpoint.

**No status is inferred by counting filenames.** A shared service is not an additional clinical agent. Duplicate functions need independent capability mapping.

## Current consolidation status

The Kimi ZIP has eight Python modules, and the second uploaded nested ZIP has five modules. Four additional agent workstreams were previously identified. This yields **17 source/workstream entries**, **not 17 qualified Nexus agents**. Kimi and v2 packages contain clinical-function overlap. Neither ZIP has been uploaded onto this branch as source in this commit.

The current repository had already contained a Drug Role agent and KnowledgeRouter code. This inventory commit does not replace production files, connect adapters, or make Vercel production-ready.

## Next required changes

- Transfer package source as tracked text modules in isolated vendor/integration directories, excluding `__pycache__`, binaries, sample PHI or credentials.
- Reconcile duplicate domain functions against canonical Nexus ownership.
- Add adapters and a shared runtime schema; do not silently swap regulated rules.
- Add deterministic and integration CI, then record commit-scoped evidence links.
- Open reviewed PR and merge only after applicable gates pass.
