# Shared PV agent completion evidence

The original drug-role engine and recovered seriousness/causality pipelines now have executable scoped service adapters. The specialist factory requires explicit registration, provider credentials, selected model identifiers and durable audit paths. There is no automatic replacement of a missing provider with an offline extractor.

## Verification

36 Python tests and 11 TypeScript tests passed locally. These cover specialist execution, scoped audit writes, reference-separated scoring, empty-metric rejection, cross-client retrieval and overlap/ownership regressions. TypeScript and targeted lint are checked separately. Offline extraction is exclusively a contract fixture and does not establish clinical accuracy.

## Additional corrections

All five CodeRabbit findings on commit 7087d are corrected: longest-first non-overlapping mentions, exact controlled product-name token matching, knowledge-type filtering before top-k retrieval, explicit client scope during indexing and HTTP status preservation. Multiple drug names sharing one sentence cue now remain UNKNOWN rather than inheriting a suspect role for every drug. The recovered offline seriousness extractor preserves unknown when a criterion is unmentioned.

## Knowledge migration

The repository migration inventory contains six general rules eligible for a staged index and one client override quarantined because its client_id is missing. See evidence/pv-agents/knowledge-migration-plan.json. This is a metadata plan, not evidence of regulatory approval or a production index switch. No client identifier is invented. Existing production index location, credentials and client assignment must be verified before promotion.

## Real-source benchmark

The original engine executed in a source-only subprocess on PMC3787171 and PMC8127514 with frozen narrative hashes. No FAERS labels, reference path, ownership master or candidate drug names were passed to inference. Scoring executes afterwards against the retained FAERS reference. These are exploratory development runs: article/patient linkage remains unadjudicated, source drugs may differ from follow-up reports, and the implementation has already been developed against these documents. They are not independent clinical holdout qualification.

The source texts and full outputs are excluded from the public repository; source hashes, comparison metrics and limitations are retained. The original benchmark has 34 candidate references. A qualified expert must determine patient linkage and source-visible drugs, assign drug roles/ownership, review disagreements and sign the qualification record. Expert review and production qualification are not complete.

## Remaining release constraints

- Runtime provider availability and actual model identifiers require verification with configured credentials.
- A hosted Python service and durable audit/index locations must be configured before enabling frontend flags.
- FAERS comparative results expose inadequate drug coverage; a controlled upstream drug NER/terminology integration remains necessary for broad extraction.
- Frontend dependency audit remains blocked by upstream braces and sprintf-js advisories. Nonbreaking upgrades remedied sharp and source-map-js. No security gate is suppressed.
- The broader historical secret scan has existing findings that require precise triage; no history is rewritten and no broad exception is added.
- All agent flags remain disabled pending the release evidence above. No clinical accuracy or expert sign-off is claimed.
