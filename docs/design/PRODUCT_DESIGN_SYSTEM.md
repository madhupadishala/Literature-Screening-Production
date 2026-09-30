# Product Design System — Gold-Standard Enterprise Safety UI

Document ID: DS-NEXUS-001  
Version: 1.0-draft  
Status: Controlled design foundation

## 1. Purpose

This document defines the mandatory product-design system for all operational and administrative UI work. UI changes shall not be treated as page-level styling tasks. They shall be designed as part of one coherent enterprise safety product.

## 2. Reference stack

The product-design system uses the following references by responsibility:

- **Figma** — design source of truth for approved layouts, interaction states and reusable component specifications.
- **IBM Carbon Design System** — primary benchmark for dense enterprise information architecture, forms, tables, filters, worklists, status presentation and operational data density.
- **PatternFly** — secondary benchmark for enterprise administration, workflow and operations patterns.
- **Radix Primitives** — accessibility and interaction-behavior benchmark.
- **shadcn/ui** — React component-composition and implementation benchmark.
- **Argus / established patient-safety systems** — pharmacovigilance workflow benchmark where relevant.
- **Current AI-native safety platforms** — benchmark for assistive AI presentation, confidence, rationale, provenance and human-in-the-loop workflow.

These references are benchmarks, not copy targets. The final product shall use its own controlled visual language and domain requirements.

## 3. Mandatory design principles

1. Dense does not mean crowded.
2. Operational users shall see the maximum useful information with the minimum unnecessary chrome.
3. Hierarchy must remain obvious at a glance.
4. Reusable components are preferred over page-specific styling.
5. Every action must be real, permission-aware and context-aware.
6. No fake buttons, fake metrics or decorative controls.
7. AI suggestions must be visually distinguishable from human decisions and authoritative regulatory data.
8. Regulated state, audit status and workflow ownership must be visible without visual noise.
9. Keyboard, focus and assistive-technology behavior are first-class requirements.
10. Empty, loading, error, blocked, read-only, final and success states must be deliberately designed.

## 4. Information architecture terminology

- **Module** — top-level functional domain in the primary module navigation.
- **Screen** — distinct functional page/workspace inside a module.
- **Tab** — related view selector inside one screen.
- **Sub-navigation** — navigation among multiple screens in one module.

## 5. Density standard

Operational PV screens shall benchmark Carbon-class enterprise density:

- compact but readable field heights;
- consistent label placement;
- dense data tables with intentional column priority;
- sticky headers where useful;
- compact filters;
- row-level and bulk actions;
- predictable status tags;
- progressive disclosure for secondary detail;
- drawers/panels for context without unnecessary route changes;
- whitespace used to separate task groups rather than inflate the interface.

## 6. Core design tokens

The product shall converge on controlled tokens for:

- typography scale;
- spacing scale;
- radii;
- borders;
- elevation;
- surface hierarchy;
- semantic status colors;
- focus indicators;
- disabled states;
- field heights;
- table density;
- motion duration.

Page-specific arbitrary values require justification and shall be reduced over time.

## 7. Operational component set

Minimum reusable component families:

- Global Application Header
- Primary Module Navigation
- Module Sub-navigation
- Global Utility / Case Actions Toolbar
- Worklist / Data Table
- Filter Bar
- Search Field
- Status Tag
- Priority Tag
- Assignment Control
- Drawer / Side Panel
- Tabs
- Accordion
- Form Field
- Date / Time Field
- Select / Multi-select
- Modal / Confirmation
- Inline Validation
- Empty State
- Loading State
- Error State
- Read-only / Final State
- AI Suggestion Panel
- Evidence / Provenance Panel
- Audit / Version Timeline

## 8. PV-specific interaction rules

- Seriousness, Listedness/Expectedness and Causality are shared governed assessment capabilities.
- AI may assist extraction, classification and recommendation, but human decisions must remain attributable where required.
- Finalized regulated records shall appear visibly non-editable.
- Workflow transitions must communicate destination, authority and consequences.
- Duplicate, QC, MR, finalization, submission and override actions require clear state feedback.

## 9. Design workflow

Every material screen redesign follows:

Requirement
-> PV workflow architecture
-> Figma wireframe
-> Carbon-density review
-> Product Design Guardian review
-> component composition
-> implementation
-> React best-practices review
-> browser visual verification
-> accessibility/interaction verification
-> acceptance evidence

Direct requirement-to-TSX implementation is not the preferred workflow for material UI changes.

## 10. Acceptance

A screen is not design-complete merely because it renders or passes TypeScript. It must satisfy the Product Design Guardian checklist and have objective visual/runtime verification.
