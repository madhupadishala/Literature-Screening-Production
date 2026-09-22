# Nexus Sprints 1–10 — Main Integration Release Candidate

Date: 2026-09-22

This integration candidate combines the completed Nexus Sprints 1–10 functional build with the current Literature Screening main branch.

## Preserved mainline work
- Literature Scheduler and scheduled production search changes already present on main are retained.
- SYSTEM_SCHEDULER RBAC remains present.
- The scheduler verification remains part of the production build gate.

## Migration reconciliation
Current main already owns migration 021 (Search Profiles and Scheduled Production Searches). Nexus migrations are remapped for integration to 022–031, preserving their original order. Historical sprint documents retain their original candidate numbering; the executable registry and verification scripts use the integration numbering.

## Release boundary
This branch is an integration release candidate only. It is not formal regulated-production approval until migrations, UAT/validation evidence, security/tenant-isolation checks, backup/restore qualification, infrastructure qualification, SOP/training readiness and controlled release approval are complete.
