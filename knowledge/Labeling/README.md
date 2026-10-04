# Labeling Documents Knowledge

This folder stores product labeling/reference-safety documents in a product-first hierarchy.

## Canonical hierarchy

```text
knowledge/Labeling/
├── <Brand-Name>/
│   └── <Generic-Name>/
│       └── <Country-or-Global>/
│           ├── SmPC/
│           ├── CCDS/
│           ├── IB/
│           ├── USPI/
│           ├── PI/
│           ├── PIL/
│           ├── Package-Insert/
│           ├── Core-Safety-Information/
│           └── Other/
│               └── _Version/
│                   ├── manifest.json
│                   ├── source/
│                   ├── derived/
│                   │   ├── parsed/
│                   │   ├── chunks/
│                   │   ├── embeddings/
│                   │   └── indexes/
│                   └── qa/
```

## Folder key

1. **Brand Name**
2. **Generic / active ingredient name**
3. **Country / jurisdiction** (or `GLOBAL` for CCDS/core company documents)
4. **Labeling document type**
5. **Document version/effective date**

## Supported labeling document types

- `SmPC` — Summary of Product Characteristics
- `CCDS` — Company Core Data Sheet
- `IB` — Investigator's Brochure
- `USPI` — United States Prescribing Information
- `PI` — Prescribing Information
- `PIL` — Patient Information Leaflet
- `Package-Insert`
- `Core-Safety-Information`
- `Other`

Additional document types may be added without changing the higher-level hierarchy.

## Document package

Each label/version is an independent governed package:

```text
_Version/
├── manifest.json
├── source/
│   └── document.<pdf|docx|xml|html>
├── derived/
│   ├── parsed/
│   ├── chunks/
│   ├── embeddings/
│   └── indexes/
└── qa/
```

## Runtime use

Labeling is a mandatory source where applicable for:
- listedness / expectedness;
- reference safety information;
- indication;
- dose/route/formulation;
- contraindications;
- warnings/precautions;
- adverse reactions;
- special populations;
- pregnancy/lactation;
- interactions;
- overdose;
- product-specific safety interpretation.

The engine must resolve the **correct product, country/jurisdiction, document type, version and effective date** before using a label.

No engine may silently use:
- another country's label;
- a superseded label;
- a different brand/formulation;
- a draft/unapproved label;
- a label whose effective date is after the case awareness date when historical versioning is required.

## Relationship to Controlled Approved Knowledge

Raw labels remain here.

Any team-approved interpretation such as:
- listedness decision rules;
- label hierarchy;
- country fallback policy;
- approved event synonyms;
- product-specific decision logic

belongs in `knowledge/Controlled-Approved-Knowledge/` and must cite the exact labeling source/version.
