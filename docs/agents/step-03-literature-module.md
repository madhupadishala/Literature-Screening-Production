# Nexus Step 3 — Literature Module integration

**Status:** STARTED — engineering scope and integration boundary established (not closed).

## Governing sequence
Step 1 Platform Core → Step 2 Shared PV Core → **Step 3 Literature Module** → Step 4 Evaluate → Step 5 Literature V1 lock → Step 6 Intake and Triage.

Step 3 uses the existing Literature implementation, not a replacement. Shared authentication/RBAC/tenancy, audit, source evidence, AI gateway, Knowledge Router, and clinical specialist agents remain owned by the Nexus platform layer. Literature supplies its specific search/import/screen/review/QC/medical review and ICSR handoff workflow.

## Literature workflow
Search → Import and deduplicate → Screening → Reviewer → Quality Control → Medical Review → Disposition → Controlled ICSR handoff into Intake.

## Engineering deliverables
1. Inventory the existing Literature workflow routes, screens, state transitions, evidence contracts and current module-specific AI calls.
2. Specify controlled interface between Literature evidence package and shared Nexus clinical agents, with tenant/client scope, provenance, correlation IDs and no unsupported medical inference.
3. Add authorized, idempotent handoff envelope for Literature-positive case candidates into Intake, retaining article IDs/PMIDs and source excerpts.
4. Trace Literature screening decisions and MR/QC dispositions to existing URS/FRS and expert-reviewed clinical rules.
5. Document failure/retry and human-review paths without adding an automatic regulatory release.

## Current boundary
Step 2's remaining clinical-rule executable versions, pending agent completion and 35-rule Knowledge Base activation remain separate and open. They **do not become complete** simply because Literature Step 3 has started. Deferred consolidated live agent validation will be performed after code assembly across the planned specialist agents.

## Next code work
Reuse the existing Literature module and identify its true case-candidate/handoff files before changing behavior. Do not create parallel Literature processing pipelines, bypass existing authorization, or treat a documentation commit as a working handoff.
