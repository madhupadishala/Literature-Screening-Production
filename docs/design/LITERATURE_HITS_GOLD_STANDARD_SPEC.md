# Literature Hits — Gold-Standard Screen Specification

Document ID: DS-LIT-HITS-001  
Version: 1.0-draft  
Status: Design source specification for Figma and implementation  
Benchmark: IBM Carbon density + enterprise safety workflow conventions

## 1. Purpose

Define the reference operational screen for the product design system. Literature Hits will establish the reusable worklist, filter, status, AI-assistance, detail-panel and decision patterns reused across Intake and Case Processing where appropriate.

## 2. Screen objective

A literature processor shall be able to answer, with minimal navigation:

1. What requires attention now?
2. Which retrieved records are duplicates or likely duplicates?
3. Which records are relevant to configured products/markets?
4. What did AI detect and why?
5. What evidence supports the suggestion?
6. What human decision is required?
7. What is the current workflow/audit state?

## 3. Page hierarchy

1. Global application header
2. Primary module navigation
3. Literature module sub-navigation
4. Screen title + compact operational summary
5. Dense filter/action toolbar
6. Main worklist
7. Contextual detail drawer
8. Decision/action area within the drawer
9. Audit/evidence access

No hero marketing treatment is permitted on this operational screen.

## 4. Module sub-navigation

Dashboard | Hits | Screening | Medical Review | Administration

Hits is active.

## 5. Compact operational summary

Use compact metrics, not oversized cards:

- Total retrieved
- Awaiting review
- Potential duplicates
- High-confidence relevant
- QC required
- Failed/retry required

Metrics are informational and must be derived from real data.

## 6. Filter/action toolbar

Recommended order:

Search | Product | Country | Source | Review status | Duplicate | AI confidence | Publication date | Assigned to | More filters

Right-aligned actions:

Refresh | Assign | Bulk action

Rules:
- filters remain compact;
- selected filters show clear removable state;
- no modal for commonly used filters;
- advanced/rare filters may use a popover/drawer;
- bulk actions only appear when rows are selected.

## 7. Main worklist

Carbon-class dense table.

Recommended columns, ordered by operational priority:

1. selection checkbox
2. priority/status
3. article title
4. source / identifier
5. publication date
6. product match
7. country
8. duplicate
9. ICSR potential / safety relevance
10. AI confidence
11. review status
12. assignee
13. last updated
14. row actions

Column rules:
- title gets flexible width;
- identifiers, tags and dates remain compact;
- status uses controlled semantic tags;
- long evidence is never rendered directly inside the table;
- row click opens contextual detail without losing worklist state;
- sorting is explicit;
- column visibility may become configurable later.

## 8. Row state semantics

A row may visually expose:

- New
- Pending Review
- QC Required
- Potential Duplicate
- Approved
- Excluded
- Flagged
- Processing Failed

Color is supportive, never the only carrier of meaning.

## 9. Detail drawer

Default desktop width: approximately 38–44% of viewport.

Sections:

### Article
- title
- authors
- journal
- DOI/PMID/source identity
- publication date
- abstract
- full-text availability

### Product & Market Match
- reported product
- normalized product
- match term/source
- company product status
- MAH status
- country of interest

### AI Assessment
Clearly labeled as AI-assisted:
- relevance suggestion
- confidence
- rationale
- evidence sentence(s)
- model/policy version where available
- uncertainty / unresolved flags

### Duplicate Assessment
- duplicate status
- candidate source count
- confidence
- matching signals
- linked prior record(s)

### Safety Assessment Preview
Shared governed assessment indicators:
- Seriousness: resolved / unresolved / not assessed
- Listedness/Expectedness: resolved / unresolved / not assessed
- Causality: resolved / unresolved / not assessed

Hits must not pretend that a downstream/final medical assessment is complete. Show stage and authority explicitly.

### Human Decision
- Approve for Screening
- Exclude / Dismiss
- Flag for QC
- Return / Retry where applicable

Decision reason is mandatory when governed workflow requires it.

### Evidence & Audit
- source evidence
- provenance
- review history
- audit trail shortcut
- evidence package status

## 10. AI vs human visual contract

AI content shall use a consistent assistive treatment and labels such as:

AI suggestion
AI confidence
AI rationale

Human decisions shall use:

Reviewer decision
Reviewer rationale
Reviewed by
Reviewed at

Never use styling that makes AI suggestions appear final/authoritative.

## 11. Interaction states

The Figma source and implementation shall include:

- loading
- populated
- no hits
- no filter matches
- API error
- partial connector failure
- retrying
- row selected
- multi-select/bulk action
- detail drawer open
- saving decision
- decision saved
- permission blocked
- read-only state

## 12. Density target

Desktop operational target:

- 32–40 px table row height depending on content;
- 32–40 px compact form controls;
- 8 px base spacing rhythm;
- screen-level spacing generally 16–24 px;
- table cell horizontal padding generally 8–12 px;
- avoid large radii/elevated cards for every section;
- use borders, surface hierarchy and grouping before shadows.

Exact values shall be converted into controlled design tokens rather than repeated arbitrary CSS.

## 13. Accessibility

- visible keyboard focus;
- all worklist actions keyboard reachable;
- semantic table structure;
- status text in addition to color;
- accessible labels for icon-only actions;
- drawer focus behavior controlled;
- no hover-only critical information;
- minimum contrast compatible with enterprise accessibility requirements.

## 14. Responsive behavior

The primary operational target is desktop/laptop.

For narrower screens:
- preserve filter/search access;
- allow table horizontal scrolling only when column reduction cannot preserve task meaning;
- move detail drawer to full-screen panel;
- prioritize article, product, status and decision fields;
- do not collapse regulated decision context into ambiguous icons.

## 15. Reuse contract

Patterns established here shall become shared primitives for:

- Intake worklists
- Duplicate Check
- Triage
- Medical Review queues
- Case Processing worklist
- Submission queues

Reuse the interaction pattern, not necessarily every field.

## 16. Acceptance

The screen shall not be declared gold-standard until:

- Figma design is reviewed;
- Product Design Guardian is passed;
- implementation uses shared components/tokens;
- React best-practices review is completed;
- browser visual verification is completed;
- keyboard/accessibility review is completed;
- no existing regulated behavior is silently removed.
