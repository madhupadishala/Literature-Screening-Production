# Step 2.1 — Clinical Rule Inventory and Traceability

**Status: COMPLETE (inventory deliverable only).**
**Source of truth:** `docs/agents/step-02/clinical_rule_traceability.json`
**Repository branch:** `integration/pv-agents-source-20261009`

## Evidence and scope
- Step 1 audit: `docs/agents/step-01-code-audit.json`.
- Clinical authority: user-dictated Nexus requirements from the October 9 PV clinical discussions.
- 17 source entries are inventoried; **16 distinct clinical functions** after the user-designated Medical History/Historical Conditions overlap.
- **35 granular expert-derived clinical rules** registered with stable IDs across drug identity, AE extraction, Day Zero, Action Taken, Dechallenge/Rechallenge and Medical History.
- Every rule includes an owner, source, status, test identifiers and regulatory review state.
- Citations are attached where a specifically identified regulatory document/section was discussed. References are supporting context, not universal mandates.
- User's prior downloaded clinical packages remain a separate copy; this repository inventory does not pretend those documents were already committed.

## Engineering and policy boundaries
- This task does **not** implement clinical behavior, change agent schemas, connect the live knowledge database or certify regulatory compliance.
- The next task (2.2) owns structured KB storage/versioning and deterministic rule evaluation.
- Runtime client policy must not override mandatory applicable reporting requirements.
- Drug/AE/IRD expert policy is treated as the authoritative **Nexus requirements baseline**; nonstandard policy applicability is explicitly recorded rather than silently overwritten.
- Two sources still reside on divergent branches. Code integration is a later task, not covered by this inventory.
- No agent is marked clinically qualified by this inventory.

## Known coverage limits
The user has not yet dictated complete detailed corrections for every remaining agent (patient, reporter, current conditions, COI, duplicates, literature, follow-up). Their previously existing source functionality is inventoried; do not fabricate user endorsement or block implementation of the already supplied rules.

Drug indication extraction was introduced conceptually but not signed off as a complete expert rulebook.

## Closure checks
- [x] Stable noncolliding rule IDs assigned for 35 expert-dictated requirements.
- [x] Clinical decision owners assigned.
- [x] All 17 code source entries mapped to paths and refs.
- [x] 16 distinct functions explicitly recorded.
- [x] Rule-level sample test IDs and provenance provided.
- [x] Regulatory evidence vs Nexus convention distinguished.
- [x] Draft/inactive runtime state explicit.
- [ ] Executable clinical rule testing — **Task 2.2 onward**, not a Step 2.1 deliverable.

**Next:** Task 2.2, only after user authorization according to the one-task-at-a-time program.
