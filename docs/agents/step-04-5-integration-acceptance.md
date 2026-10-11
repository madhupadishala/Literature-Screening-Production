# Nexus Step 4.5 — End-to-End Integration and Controlled Release Evidence

**Baseline:** `80ac0cfb89df1c08c8ecbfdcd91d0995f5a00c32`
**Disposition:** IN PROGRESS — NO clinical or production release authorization
**Dependency:** Step 4.4 engineering handed over conditionally; open hosted test and signoff gates remain tracked.

## Scope and acceptance gates

| ID | Requirement | Minimum acceptance evidence | Current status |
| --- | --- | --- | --- |
| 4.5-01 | Literature → Shared Agent → Medical Review end-to-end, with authenticated scoped staging identity | Real staging API and UI request/response, traced audit IDs, source revision | OPEN |
| 4.5-02 | Tenant, client, user, and role isolation | Positive and negative HTTP/DB fixtures with isolated principals | OPEN |
| 4.5-03 | Suggestion-only safeguards | Verify no mutation to human clinical conclusions, approvals, disposition, or Intake from agent suggestions | OPEN |
| 4.5-04 | KB governance | Versioned citations from approved regulated knowledge, no cross-client leakage | OPEN |
| 4.5-05 | Hosted resilience and audit | HTTP auth denial, timeout, downstream outage, replay, durable restart and audit correlation | OPEN — carried from 4.4 |
| 4.5-06 | Reproducible regression | CI runs all relevant gates for one immutable commit SHA | OPEN — run on sprint branch |
| 4.5-07 | Independent reviewer UAT and PV expert adjudication | Actual reviewer identities, dates, discrepancy records, signoff | OPEN |
| 4.5-08 | Security/QA release authorization | Independent security acceptance, URS/FRS traceability, QA decision | OPEN |

## Execution rules
1. Use Nexus Vercel, Render Free staging and isolated Neon UAT only; do not modify production or unrelated Terrevo systems.
2. Keep Render `NEXUS_PV_AGENTS_ENABLED=false` and all frontend clinical flags false until authorized source transfer, client mapping and expert review.
3. Shared Nexus KnowledgeRouter is available to all registered agents, but source visibility must still be filtered by tenant/client, approval status, effective date, and jurisdiction.
4. Never describe a mocked test as a live end-to-end validation. Any unavailable clinical worker remains a recorded dependency, not a silent pass.
5. Store test evidence as sanitized metadata, hash, action, response status and audit identifier; no credentials or patient narratives in Git.
6. Independent clinical and security signoff cannot be asserted by automated tests or this workstream's developer.

## Carried-forward Step 4.4 controls
- Live Render HTTPS health and Neon readiness passed with specialist execution disabled.
- Dedicated non-admin Neon role allows audit SELECT/INSERT only.
- Live provider-backed assessment, cross-tenant HTTP denial, restart replay/audit proof and human approval remain unresolved and are 4.5 release blockers.

## Current sprint action
- Sprint-specific branch created from pinned Step 4.4 baseline.
- Write/execute end-to-end regression and capture CI with immutable commit evidence.
- Prepare evidence bundle for independent review and record real results once obtained.

**Next phase:** This is final sprint of Nexus Step 4 roadmap (4.1–4.5); it does not complete all Nexus business modules or clinical AI-agent qualification.
