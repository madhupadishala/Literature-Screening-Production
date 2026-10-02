# Wave 4 — Sprints 11–14 Product Design & Operational UX Reconciliation

Document ID: CLEANUP-WAVE-11-14-001  
Branch: `cleanup/zero-deviation-baseline-20260930`  
Status: STARTED  
Deployment rule: source qualification first; intentional Vercel preview only at governed checkpoints.

## Scope

Wave 4 converts the qualified module foundations into one coherent, dense, human-designed enterprise safety workspace while preserving authorization, regulated workflow state, auditability and module independence.

### Sprint 11 — Product Design System v1.0 + Application Shell

Objectives:
- consolidate design tokens and remove page-level visual drift;
- establish one governed application shell and module-navigation model;
- make tenant/environment/workspace/module context legible without consuming excessive screen space;
- remove decorative/fake application chrome;
- standardize operational headers, metrics, status, actions, empty/loading/error/read-only states;
- retain keyboard/accessibility and permission-aware behavior.

### Sprint 12 — Literature Operational UX

Screens:
- Dashboard
- Hits
- Literature Screening
- Medical Review
- Admin

Controls:
- dense evidence-first worklist;
- filters/search/sort/bulk actions;
- review workspace;
- seriousness/listedness/causality visibility where applicable;
- AI suggestion vs human decision distinction;
- audit/evidence access.

### Sprint 13 — Intake & Triage Operational UX

Screens:
- Intake
- Duplicate Check
- Triage
- Medical Review

Controls:
- source/document context;
- extraction/validation;
- case-validity assessment;
- duplicate/follow-up handling;
- seriousness/listedness/causality shared assessment surface;
- disposition and audit evidence.

### Sprint 14 — Case Processing Operational UX

Screens:
- General
- Patient
- Products
- Events
- Narrative
- Action Items
- Other

Shared assessment surface:
- seriousness;
- listedness / expectedness;
- causality.

Controls:
- dense regulated form layout;
- field-level provenance where applicable;
- editable vs finalized state;
- case actions;
- evidence/export access;
- QC / Medical Review handoff clarity.

## Mandatory Wave 4 gates

All ten existing gates remain mandatory:
1. Karpathy
2. Ponytail
3. Product Design Guardian
4. Architecture Guardian
5. Warpath
6. CodeRabbit
7. Hacker Gate
8. Evidence Gate
9. Regulatory Knowledge Gate
10. Modular & Benchmark Completeness

## Design references

- Figma — controlled design source of truth for material redesigns
- IBM Carbon — primary dense enterprise benchmark
- PatternFly — enterprise operations/admin benchmark
- Radix — interaction/accessibility benchmark
- shadcn/ui — React composition benchmark
- mature patient-safety platforms — workflow/domain benchmark

References are benchmarks, not copy targets.

## Vercel deployment clause

Wave 4 development SHALL NOT auto-deploy from the working branch. Browser previews are produced only from the dedicated `preview/wave4` checkpoint branch after source gates pass and runtime validation is materially needed.

## Current Sprint 11 status

- Wave 4 governance: IMPLEMENTED
- Vercel work-branch auto-deployment suppression: IMPLEMENTED — `frontend/vercel.json` disables the cleanup working branch; deployment is reserved for qualified `preview/wave4` checkpoints
- shared design-token consolidation: IMPLEMENTED — governed token layer is loaded globally
- governed Application Shell: IMPLEMENTED — primary navigation, module sub-navigation and main-content boundary are reusable shell primitives
- operational state contract: IMPLEMENTED — loading, empty, error, read-only and informational states share one accessible primitive
- entry-screen reconciliation: IMPLEMENTED — platform dashboard, Literature dashboard, Intake, Case Processing and Submissions use the governed shell
- Sprint 11 static verification: IMPLEMENTED — `cleanup:sprint11:verify` is enforced in both quality workflows
- legacy page-level visual drift cleanup: IN PROGRESS — remaining workflow/detail screens will be reconciled without changing regulated business behavior
- exact-head CI: PENDING
- CodeRabbit review: PENDING
- browser verification: DEFERRED until intentional `preview/wave4` checkpoint
