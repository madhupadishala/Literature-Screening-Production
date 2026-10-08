# Shared PV agent completion evidence

The original drug-role engine and recovered seriousness/causality pipelines now have executable scoped service adapters. The specialist factory requires explicit registration, provider credentials, selected model identifiers and durable audit paths. There is no automatic replacement of a missing provider with an offline extractor.

## Verification

45 Python tests and 16 Node tests (including TypeScript clients, real HTTP integration and the lint dependency adapter) passed locally. These cover specialist execution, scoped audit writes, reference-separated scoring, empty-metric rejection, cross-client retrieval and overlap/ownership regressions. TypeScript and targeted lint are checked separately. Offline extraction is exclusively a contract fixture and does not establish clinical accuracy.

## Additional corrections

All five CodeRabbit findings on commit 7087d are corrected: longest-first non-overlapping mentions, exact controlled product-name token matching, knowledge-type filtering before top-k retrieval, explicit client scope during indexing and HTTP status preservation. Multiple drug names sharing one sentence cue now remain UNKNOWN rather than inheriting a suspect role for every drug. The recovered offline seriousness extractor preserves unknown when a criterion is unmentioned.

## Knowledge migration

The repository migration inventory contains six general rules eligible for a staged index and one client override quarantined because its client_id is missing. See evidence/pv-agents/knowledge-migration-plan.json. The six eligible general rules were built into a staged Chroma semantic index using a hash-verified all-MiniLM-L6-v2 ONNX model; a scoped retrieval query returned six valid global records. See staged-index-verification.json. This is not evidence of regulatory approval or a production index switch. No client identifier is invented. Existing production index location, credentials and client assignment must be verified before promotion.

## Real-source benchmark

The original engine executed in a source-only subprocess on PMC3787171 and PMC8127514 with frozen narrative hashes. No FAERS labels, reference path, ownership master or candidate drug names were passed to inference. Scoring executes afterwards against the retained FAERS reference. These are exploratory development runs: article/patient linkage remains unadjudicated, source drugs may differ from follow-up reports, and the implementation has already been developed against these documents. They are not independent clinical holdout qualification.

The source texts and full outputs are excluded from the public repository; source hashes, comparison metrics and limitations are retained. The original benchmark has 34 candidate references. A qualified expert must determine patient linkage and source-visible drugs, assign drug roles/ownership, review disagreements and sign the qualification record. Expert review and production qualification are not complete.

## Remaining release constraints

- Vercel metadata confirms existing Groq/OpenAI credentials and the production Groq model configuration. It contains no shared PV service URL/token or specialist registration. The recovered factory now supports the existing Groq provider/model configuration as well as Anthropic. Credentials must be injected into the hosted Python service; actual provider execution is not yet verified.
- A hosted Python service and durable audit/index locations must be configured before enabling frontend flags.
- FAERS comparative results expose inadequate drug coverage; the optional strict Groq source-grounded mention extractor has been integrated, but its live extraction coverage and drug-role performance require independent evaluation.
- The high-severity frontend dependency audit passes. A bounded Node-native adapter replaces only the Next lint plugin's glob dependency and removes braces; sharp and source-map-js were upgraded. Three moderate sprintf-js/argparse/mammoth findings remain. No security gate is suppressed.
- The historical secret scan findings were checked against exact source lines: 20 public Cloudflare analytics identifiers and one SHA-256 verifier. Exact historical fingerprints are documented, with no path/rule exclusions. The production diagnostic endpoint now requires explicit enabling and an environment-provided verifier. No history is rewritten.
- All agent flags remain disabled pending the release evidence above. No clinical accuracy or expert sign-off is claimed.

Full frontend lint passed with one existing unused-component warning; TypeScript and the production build passed. The scoped specialist HTTP contract test uses explicit offline extraction fixtures; live Groq coverage is still unverified.

The synchronous causality route rejects more than 25 pairs, and specialist narratives are bounded at 50,000 characters. Larger workloads need a queued assessment; they are not silently truncated.

All five subsequent review findings on ad319 are corrected: the audit manifest anchors the latest row, knowledge keys include tenant and jurisdiction, product retrieval excludes non-label domains, index rebuild removes stale scoped records, and upstream service authentication failures map to HTTP 502. Additional checks enforce explicit effective knowledge scope and serialize audit chain writes across database connections. Existing knowledge pins must be regenerated and reviewed for the new scoped key format; no production pin migration is claimed.
