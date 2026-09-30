# Product Design Guardian Gate

Document ID: GATE-DESIGN-001  
Version: 1.0-draft  
Status: Mandatory controlled gate for material UI changes

## 1. Gate objective

Prevent functional but inconsistent, developer-assembled UI from entering a qualified release.

## 2. Required review dimensions

A material UI change shall be reviewed for:

- information hierarchy;
- Carbon-class enterprise density;
- typography consistency;
- spacing consistency;
- component reuse;
- navigation consistency;
- accessibility;
- keyboard behavior;
- focus visibility;
- responsive behavior;
- loading state;
- empty state;
- error state;
- disabled state;
- read-only/final state;
- permission-aware actions;
- workflow clarity;
- table usability;
- form usability;
- AI-vs-human distinction;
- audit/evidence discoverability;
- visual verification in a real browser.

## 3. Blocking anti-patterns

The gate shall reject new UI that introduces, without approved justification:

- fake or non-functional controls;
- duplicated navigation models;
- arbitrary page-specific visual systems;
- inconsistent button semantics;
- uncontrolled status colors;
- inaccessible custom controls when reusable accessible primitives exist;
- hidden regulated state changes;
- unclear disabled actions;
- missing error/loading/empty states for asynchronous workflows;
- uncontrolled horizontal overflow;
- giant low-information cards on dense operational screens;
- tabs used as substitutes for distinct screens/modules;
- one-off styling that should be a shared component/token;
- AI output presented as authoritative human/regulatory determination.

## 4. Tooling and skills

The design gate may use:

- Figma for source-of-truth screen design and design-system review;
- IBM Carbon and PatternFly as enterprise UX benchmarks;
- Radix interaction/accessibility patterns;
- shadcn/ui composition guidance;
- React best-practices review;
- agent-browser / browser verification;
- v0 for comparative UI exploration;
- CodeRabbit for implementation review.

These tools assist the gate; they do not replace human product/PV acceptance.

## 5. Evidence

For material redesigns retain, where applicable:

- approved Figma node/file reference;
- before/after screenshot;
- design-review disposition;
- browser verification result;
- accessibility findings;
- React review findings;
- linked URS/FRS requirement;
- exact implementation commit.

## 6. Qualification rule

A material UI change cannot be declared gold-standard or release-qualified when Product Design Guardian has a material unresolved finding.
