# AG10 — Medical Article Translation Agent

This directory contains a **real provider-backed translation adapter** in `translation_agent.py`. It can translate supplied foreign-language abstracts or full-text article text into English (or another explicitly named target language), with chunk-level source alignment, source hashes, fail-closed provider handling, and mandatory human review status.

Configure on a **backend server**, never in a browser:
- `NEXUS_TRANSLATION_ENDPOINT` — approved HTTPS OpenAI-compatible `/chat/completions` endpoint.
- `NEXUS_TRANSLATION_API_KEY` — approved provider credential.
- `NEXUS_TRANSLATION_MODEL` — translation-capable model identifier.

Usage from a server-side Python service:

```python
from translation_agent import translate_article
out = translate_article(article_text, source_language="Japanese", target_language="English",
                        tenant_id=authorized_tenant, client_id=authorized_client)
print(out.to_dict())
```

Tests: `cd Agentic_AI/AG10_Translation && python -m unittest discover -s tests -v`.

**Scope and limits:** Actual translation requires a configured model provider and access to the text of an article. This agent does not fetch paywalled article text, detect language authoritatively, enforce permissions on its own, verify translation medical accuracy, or persist clinical records. Calling systems must enforce tenancy, handle PHI/privacy agreements, store the original and review decisions, and never treat unreviewed translations as approved evidence. Provider-based execution and Nexus frontend/API integration have **not** been tested or established by this commit. Historic TypeScript files under `src/branches/` include a mock service and are preserved solely as recovered reference source.
