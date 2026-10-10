# Batch 2 source intake

Batch 2 source has **not yet been committed** to this GitHub branch. The complete 22-file import is supplied separately as `nexus-shared-agents-batch2-import.zip` from the current session.

Import destination: `platform/shared-agents/batch2/`, with the uploaded archive's original internal paths retained.

Five agents: `narrative.py`, `special_situations.py`, `indication.py`, `event_outcome.py`, `regulatory_clock.py`.

Also retain `core/`, `api.py`, `rulepacks/`, `knowledge/`, `tests/`, `pyproject.toml`, README, and SOURCE_MANIFEST.

Do not mark the five as registry-connected or Nexus-integrated until the source has been committed, common contracts implemented, and regression / tenant isolation tests pass.
