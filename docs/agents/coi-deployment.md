# COI Nexus integration
Endpoint POST /api/ai/coi; review screen /coi. Uses existing AI provider credentials/model, LangGraph orchestration and LangChain RunnableLambda with strict Zod outputs. Tenant/workspace module authorization and PostgreSQL AI audit are mandatory. This is a review-only engineering release, not a clinically qualified automatic case update.

Input: module literature/intake/case_processing and segments with unique id, text (max 6500 characters), locator. Max 8 segments and 48000 total characters. Caller must supply complete verified extracted text; raw PDF/XML/OCR uploads are not supported by this deployed adapter. No top-k retrieval discards patient text. Existing Qdrant/KB is not connected to this native adapter; Python source package separately implements scoped policy retrieval. Independent verifier is a separate call to the same configured model, not an independent clinical reviewer.

Returns patient/event country suggestions, exact source quotes/locators, conflicts/unknown, source hash, warnings. Every result has automaticRelease=false and qualified=false. No case fields are overwritten. Source hash is of submitted segments, not original binary. PostgreSQL audit records hash and decision count, not unredacted source text. Clinical benchmark, OCR, source-format adapters, durable jobs and model qualification remain pending.

Checks: scripts/verify-coi-agent.ts, TypeScript, focused ESLint and full Next build. Controlled model doubles verify engineering flow only; real authenticated patient-case execution not established by these tests.
