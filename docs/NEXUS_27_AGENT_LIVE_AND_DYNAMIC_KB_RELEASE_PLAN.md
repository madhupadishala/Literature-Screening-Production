# Nexus 27-agent activation and continuous KB publication contract

**Engineering owner plan:** 15 October 2026. Source branch:
`integration/nexus-27-agents-kb-execution-20261015`.
The 27 registry entries must not be reported as 27 clinical services running.

## 1. Confirmed code state

The dispatcher has 13 non-provider-configured review-only bindings:
AG01, AG05, AG06, AG07, AG10, AG14, AG15, AG16, AG21, AG22, AG23, AG25, AG27.
AG10 additionally requires an approved configured private translation provider for
cross-language execution (same-language pass-through is local).
AG18/19 require an injected DB candidate repository; AG03/04/09/24 require
approved structured LLM service; AG11/13 may use recovered, injected native
seriousness/causality pipelines; AG02/08/12/17/20/26 still need approved
native runtime/service bridges. These are not all live.

### Six native-runtime/service bridges remaining

| ID | Canonical native runtime | Required hosted wiring / qualification |
|---|---|---|
| AG02 | Recovered Python EventEngine / FastAPI | Host approved private extractor, source attachment parsing, licensed MedDRA mapping, reviewer/audit, authorized tenant-client identity |
| AG08 | Existing Next.js COI LangGraph agent | Inject approved server-owned AIProvider, exact source spans, E2B event country consistency; call through authenticated Next.js execution route |
| AG12 | Recovered TS listedness and label knowledge modules | Retrieve product/client/country/effective label from controlled approved KB; versioned terminology, fail unresolved on missing label |
| AG17 | Recovered TS safety assessment engine | Connect verified drug/event agents, source evidence and uncertainty; never treat unqualified inference as definitive |
| AG20 | Existing controlled Nexus narrative route | Verify case-scope RBAC, preserve narrative versions and audit, invoke only through signed server-authorized case workflow |
| AG26 | Existing Nexus intake triage evaluator/route | Verify source-driven validity, duplicate, seriousness and routing with approved intake context and audit |

### Two injected native pipelines

AG11 requires a real `SeriousnessPipeline` with a qualified extraction provider,
controlled IME data and durable audit; AG13 requires a real `CausalityPipeline`,
approved knowledge pins/policies, label data and durable audit. Both have
strict case/client identity checks and return human-review-required outputs.

## 2. Continuous knowledge updates — user requirement

**Rule:** Uploading or creating a folder automatically makes it *discoverable*;
it never makes draft content *approved or clinically authoritative*.

1. **Land new source** in Nexus KB staging. Accept the existing SOP, Regulatory,
   Controlled Approved Knowledge, Scenarios, Labeling, Products, Clients and
   Dictionaries folders, plus future domain folders without hard-coding paths.
   Each document receives a stable document ID, hash, tenant/client/jurisdiction,
   product, agent scopes and approval/effective-date metadata.
2. **Governed review and signed manifest:** Authorized knowledge owners verify
   content, provenance, licensing, supersession and approval. An isolated
   approval service signs `knowledge.manifest.json`; the approval key MUST stay
   server-side in `NEXUS_KNOWLEDGE_MANIFEST_SECRET`. Drafts, absent signatures,
   expired files, bad hashes, malformed paths and cross-client scope fail closed.
3. **Publish controlled version:** In production, ingest approved records into
   existing `controlled_knowledge_repositories`, `knowledge_documents` and
   `knowledge_chunks` with content SHA, embedding version and `production_eligible`
   flag. Index into the client-scoped retrieval collection; create the replacement
   index BEFORE atomically marking the new repository version active. Never run
   clinical decisions on similarity top-k alone.
4. **Refresh without per-agent rewiring:** Publish a KB version event; shared
   `KnowledgeRouter` invalidates its relevant tenant+client+jurisdiction+agent
   cache and fetches the active approved version on its next signed request.
   Exact rule resolution precedes hybrid retrieval. Agent outputs include
   source document/hash/version and evidence spans.
5. **Withdraw/change:** Superseded/revoked documents must stop appearing in
   new assessments immediately after the atomic active-version switch; previous
   assessments retain pinned historical hashes and citations. Re-evaluate
   dependent cases only by controlled change-impact policy.

### Current implemented first slice (in this branch)

`backend/knowledge/folder_discovery.py` recursively detects any new
`knowledge.manifest.json` at each invocation. It requires an HMAC-signed
approved manifest, source hash, exact tenant/client/agent/jurisdiction and
effective validity, then routes verified text to
`AgentContextPack.approved_documents`. It never silently makes references
mandatory clinical decision rules. Tests prove same-request discovery after a
folder is added, denial to a different client/agent, unsigned manifests,
invalid hashes and path traversal.

**Not yet implemented:** A production Nexus KB upload/approval UI, durable
object ingestion event, approved-manifest signer service, automated Postgres
version publish/indexer, cache/event fan-out across Render and Vercel. The
first slice reads files available to the running Python host; Git source
files cannot hot-update a deployed immutable Render image without either
a controlled deployment or mounted/durable KB sync. Do not promise Git
changes alone appear in a running service.

## 3. Staging and production gates

- Keep the Render service on its currently qualified branch while new branch
  services are being reconciled. It currently tracks
  `integration/nexus-agent-five-steps-20261011`, not the agent migration branch.
- Build the six TS/Python native bridges with authenticated server-to-server
  identity; no public URL chosen from client input. Never transmit actual
  patient data to an unapproved external AI provider.
- Persist privacy-minimized hash-chained audit, include knowledge revision,
  tenant/client scope, provider/model/prompt version, error and review route.
- Run independent synthetic samples for all 27, include 3-tenant / 3-client /
  environment isolation, empty-evidence, source tampering and provider failure.
- Run source-document clinical holdout evaluation with independent PV adjudication.
  Any failures remain review-only and fail-closed.
- Host a controlled Render/Next.js staging release at its **exact passing SHA**;
  verify all agents with signed dispatch envelopes and real KB retrieval.
- Obtain independent PV/QA/security signoff before autonomous production use.

**Unrelated deferred item:** R2 ICSR roundtrip/isolation and attachment activation
remain open in issue #103; do not silently enable attachments.
