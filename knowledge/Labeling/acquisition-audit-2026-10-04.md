# Labeling Acquisition Audit — Synthetic Product Master

Date: 2026-10-04  
Product Master: `TheClinixAI_Synthetic_Product_Master_10_Products.csv`  
Product Master Version: `1.0.0`

## Conclusion

The current 10-product Product Master is synthetic/demo data. The configured MAH is `ClinixAI Demo Pharma Pvt Ltd`, which could not be verified as an authoritative real-world MAH for these products. Therefore no public labeling document has been linked to these product identities.

This is a deliberate safety control. A public label with the same or similar brand/generic name must not be attached to a synthetic product unless the actual MAH, jurisdiction, product presentation and authorization identity match.

## Current configured jurisdiction

All ten demo records carry `country = India` in the Product Master. This is treated as the configured product/authorization jurisdiction, not proof of the MAH's legal country of establishment.

## Product verification status

| Product ID | Brand | Generic | Configured Country | Authoritative MAH verified | Label acquisition |
| --- | --- | --- | --- | --- | --- |
| DEMO-PROD-001 | Clinivex | Paracetamol | India | No | Blocked |
| DEMO-PROD-002 | Neurovia | Pregabalin | India | No | Blocked |
| DEMO-PROD-003 | Cardionex | Amlodipine | India | No | Blocked |
| DEMO-PROD-004 | Glycora | Metformin | India | No | Blocked |
| DEMO-PROD-005 | Gastrovia | Pantoprazole | India | No | Blocked |
| DEMO-PROD-006 | Allerzen | Cetirizine | India | No | Blocked |
| DEMO-PROD-007 | Respira-L | Montelukast | India | No | Blocked |
| DEMO-PROD-008 | Ceflora | Cefixime | India | No | Blocked |
| DEMO-PROD-009 | Lipirex | Atorvastatin | India | No | Blocked |
| DEMO-PROD-010 | Serovex | Sertraline | India | No | Blocked |

## Public-name collision warnings

- **Clinivex** — public search identifies Clinivex Enterprise Inc. as a research-chemical/laboratory supplier rather than the configured Paracetamol therapeutic MAH.
- **Cardionex** — public results identify unrelated supplement/other products, not the configured Amlodipine product.
- **Glycora** — public results identify unrelated supplement/software uses, not the configured Metformin product.
- **Allerzen** — public regulatory/search results show unrelated cetirizine products, including an Indonesian product associated with PT Pabrik Pharmasi Zenith.
- **Ceflora** — public Indian pharmacy information shows a different Ceflora product with different composition/strength/marketer.
- **Lipirex** — public manufacturer information identifies Lipirex atorvastatin with Highnoon Laboratories in Pakistan, not the configured synthetic MAH/India record.

These collision examples demonstrate why label acquisition must be identity-resolved before download.

## Folder preparation completed

Each product now has:

```text
knowledge/Labeling/<Brand>/<Generic>/India/
├── product-profile.json
├── SmPC/
├── CCDS/
├── IB/
├── USPI/
├── PI/
├── PIL/
├── Package-Insert/
├── Core-Safety-Information/
└── Other/
```

The document-type folders intentionally contain no source label until authoritative product identity is confirmed.

## Required identity before label acquisition

For each real product, provide or verify:

1. exact brand name;
2. generic/API and composition;
3. strength, dosage form and route;
4. actual MAH/legal manufacturer;
5. country/jurisdiction of authorization;
6. marketing authorization / registration number where available;
7. lifecycle status and effective dates;
8. applicable label hierarchy (e.g. CCDS, SmPC, USPI, PI, IB);
9. official regulator/MAH source.

Once identity is verified, the exact source documents can be acquired, hashed, versioned, parsed, chunked, embedded and linked to the product.
