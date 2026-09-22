# Nexus Integrated RC1

## Integration base
Current main at c012f8ff69164eceefbdb07e91600d19f2645336.

## Preserved main capability
Migration 021 remains the already-merged Search Profiles and Scheduled Production Searches migration.

## Nexus migration sequence
To avoid duplicate migration IDs and preserve production migration history, the Nexus functional migrations are integrated as:

- 022 — Nexus Module Entitlements
- 023 — Nexus Common Safety Backbone
- 024 — Nexus Intake Sources
- 025 — Nexus Intake Review and Extraction
- 026 — Nexus ICSR Validity and Triage
- 027 — Nexus Duplicate and Follow-Up Review
- 028 — Nexus Intake Disposition
- 029 — Nexus L2A Case Processing
- 030 — Nexus Case Review and Finalization
- 031 — Nexus Case Evidence and Export

## Merge policy
Current-main Literature scheduler/admin functionality is authoritative where it was added after the original Nexus sprint branch point. Nexus RBAC, module entitlements, Intake and Case Processing are layered on top.

The integration candidate must pass the Literature scheduler verification, the legacy PV quality gates, Nexus Sprints 1–10 verification and the production Next.js build before merge.
