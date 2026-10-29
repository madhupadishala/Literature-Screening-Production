# NEXUS UI Standards

Status: controlled engineering standard, pending product/QA approval. Applies to all NEXUS workspaces.

## 1. Shell and module registry contract

Use the existing `components/enterprise/ApplicationShell` and the single `lib/nexus/ui-module-registry.ts` for Literature Screening, Intake, Case Processing and Submissions. Do not add duplicate shells, route-specific navigation offsets, new authentication paths or independent workspace selectors. Identity, tenant, client and module entitlements are read from existing authorized context. Navigation must preserve the skip link, keyboard access, `aria-current` and consistent heading hierarchy.

## 2. Canonical tokens

The sole source of theme values is `frontend/app/design-tokens.css`. Components use semantic `--nx-*` variables; they must not introduce raw hexadecimal values, styled-jsx or competing theme declarations. `--nx-primary` expresses the main interactive action; hover, active, focus and subtle surfaces use companion variants. Status colors describe UI semantics, not medical conclusions. Light and dark modes require tested 4.5:1 normal-text contrast. Respect reduced-motion preferences.

### How to extend tokens

1. Identify the semantic role and usage, not merely a screenshot color.
2. Add `--nx-info`, `--nx-info-subtle`, `--nx-slate` or a similarly named alias in the canonical stylesheet, with explicit light and dark mappings to appropriate Carbon palette values.
3. Check foreground/background contrast, focus visibility and color-blind differentiation.
4. Update design-integrity tests and the controlled review record. Never silently convert unmapped colors based only on CIE distance.
5. Apply the token through CSS modules and reusable primitives, not inline hex or `style jsx`.

## 3. Data honesty and five states

DataTable and all operational data panels must distinguish:
- **Loading:** visible skeleton with `aria-busy`, no implied records.
- **Empty:** explicit zero-result explanation and a usable next action.
- **Error:** accessible alert Notice, actual failure reason and Retry action; never render the empty message after HTTP 500 or malformed data.
- **Read-only:** lock icon/notice with reason and current owner when available; modifying controls disabled.
- **Finalized:** immutable state, visible audit reference and permitted read-only review.

Never seed operational production queues or KPIs with synthetic records. Preview fixtures must be clearly labelled and isolated to nonproduction builds. AI suggestions are identified as nonfinal, shown with source evidence and separated from reviewer decisions. Human release, clinical approval and audit trails remain authoritative.

## 4. Page pattern

Use: approved shell → module subnavigation → title/summary → filters and search → metrics → worklist → record detail drawer → AI evidence beside human decisions → audit/reference links. Use shared `components/ui` Button, Input, Select, Badge, Section, Tabs, DataTable, Drawer/Dialog, Notice and EvidencePanel. Keep screen-specific modules under 300 lines; extract hooks and workflow services without changing API contracts.

## 5. Accessibility and GxP review baseline

Provide visible keyboard focus, escape-to-close modal behavior, focus containment and restoration, semantic labels, accessible table headings, status labels that do not depend on hue, noninteractive finalized controls, 12px minimum body/control text and WCAG AA contrast. Validate permission failures, multi-tenant isolation, lease conflicts, stale updates and server errors. Audit actions must retain identity, timestamp, rationale and version reference through existing services.

## 6. New-module acceptance checklist

- [ ] Module registered in the canonical UI module registry.
- [ ] Correct existing authenticated workspace context and entitlements applied.
- [ ] All visible colors and metrics from approved tokens/live services.
- [ ] Five data states and Retry/lock/audit controls verified.
- [ ] Clinical AI proposal visibly separated from human decision.
- [ ] Keyboard navigation, labels, dialogs and contrast verified.
- [ ] API, assignment and edit-lease regression tests green.
- [ ] Screenshots and visual diffs reviewed where appropriate.
- [ ] No changes to regulated API/auth routes without separate review.
- [ ] Product Design Guardian and QA review recorded before merge.

## 7. Deferred items

Authenticated pixel equivalence across six routes and mapping of 339 unmapped legacy colors are deferred to separately approved tickets. These items do not authorize replacing production records or modifying auth.
