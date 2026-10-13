# AG10 — LibreTranslate Medical Article Translation

**Selected upstream:** https://github.com/LibreTranslate/LibreTranslate (AGPL-3.0; uses Argos Translate). This folder contains an adapter to the upstream service, not a reimplementation of its translation engine.

## Deployment and configuration

Run an authorized self-hosted LibreTranslate service, for example in a local development environment:

```sh
docker run --rm -p 127.0.0.1:5000:5000 libretranslate/libretranslate
export NEXUS_LIBRETRANSLATE_URL=http://127.0.0.1:5000
```

The service is not deployed by adding the adapter to GitHub. The public hosted LibreTranslate service may require a paid key; the configured self-hosted service avoids that requirement. Confirm supported language pairs with the instance's `/languages` endpoint.

The backend integration entrypoint is `libretranslate_adapter.translate_medical_article`:

```python
from libretranslate_adapter import translate_medical_article
result = translate_medical_article(
    abstract_or_full_text,
    tenant_id=authorized_tenant,
    client_id=authorized_client,
    source_language="auto",
    target_language="en",
)
```

Result includes original-text segment alignment, translated segments, a source hash, and human-review status. Client and tenant authorization must be performed upstream before calling this adapter; the component does not persist results or fetch documents.

The previous `translation_agent.py` and recovered TypeScript mock files remain preserved. The new adapter calls the **actual** LibreTranslate `POST /translate` API. Do not use the mock translation service for medical work. Medical language accuracy and approved glossary handling are not guaranteed by general-purpose Argos models.

**Status:** Integration adapter committed. No LibreTranslate service, production credential, or hosted Nexus integration is provisioned by this commit. AG10 is not yet an operational end-to-end Nexus feature. Check AGPL-3.0 obligations before distributing or modifying the upstream service.
