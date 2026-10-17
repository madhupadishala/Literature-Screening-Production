# Nexus AG02–AG27 recovered engine audit — 15 October 2026

This document records **source presence**, not production qualification or execution readiness.
A specialist is only marked bound once its code imports, meets the two-argument
`(evidence, scoped_knowledge_pack) -> dict` dispatcher contract and executes in tests.

| Agent IDs | Existing recovered code | Binding blockers |
|---|---|---|
| AG02 | Python event runtime in nested historical branch copy | Move/resolve imports, MedDRA licensing and coder availability |
| AG03, AG04, AG09, AG24 | v2_5 Python extraction agents | Require injected LLM and v2_5 common dependency reconciliation |
| AG05 | Historical drug-role indication/action policy | Resolve engine interface and source dependencies |
| AG06, AG14, AG15, AG18, AG19, AG21, AG22, AG23 | Eight Python specialists under kimi8 recovered trees | Existing shared kimi8_core orchestrator imports non-present `agents` module; reconcile source package paths, register and typed input |
| AG07 | No standalone Python source in AG07 | Locate canonical lab engine or implement and independently test |
| AG08 | TypeScript recovered source | Expose governed backend invocation / preserve language boundary |
| AG10 | Python translation engine present | Requires approved private provider for cross-language execution; same-language mode can run independently but client context contract must be wired |
| AG11 | Python seriousness pipeline | Resolve package and approved IME/CTCAE data |
| AG12 | TypeScript labeling sources | Resolve actual approved product-specific label knowledge and TS service contract |
| AG13 | Python causality pipeline | Resolve evidence, causal rule packs, source consistency and package imports |
| AG16 | No standalone Python in AG16 | Locate relevant AESI implementation and bind with approved list |
| AG17 | TypeScript safety implementation | Typed service bridge and governed output contract |
| AG20 | TypeScript narrative implementation | Typed service bridge and audit provenance |
| AG25 | No standalone Python in AG25 | Locate validity engine, prove four-criteria checks |
| AG26 | TypeScript intake/triage implementation | Typed service bridge and server-side permission enforcement |
| AG27 | No standalone Python in AG27 | Locate patient/aggregate assessment engine or implement |

**Current status (15 October 2026):** AG01, AG06, AG14, AG15, AG21, AG22 and AG23 are explicitly bound in `VERIFIED_BINDINGS` (engineering-only, pending CI and clinical qualification). Eight Kimi specialist implementations, their imports and regulatory register were restored to the canonical shared layer. AG18/AG19 remain unbound until authenticated comparison-set retrieval is implemented.
All other agents fail closed. The 27-agent registry is not proof that 27 engines run.
Do not deploy or change clinical-autonomy flags on the basis of this inventory.

**Next qualification gate:** Import and dependency fixes, verified tenant/client knowledge,
real specialist outputs with evidence spans, adversarial test cases and independent PV review.
