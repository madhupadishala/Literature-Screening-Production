"""AG10 LibreTranslate adapter — use the existing open-source translation engine.

Server-side only. Operate LibreTranslate on a trusted private host; never send
private patient data to a public translation endpoint without authorization.
"""
from __future__ import annotations
import json
import os
import urllib.request
import urllib.error
from dataclasses import dataclass
from urllib.parse import urlsplit

from translation_agent import TranslationError, translate_article

@dataclass(frozen=True)
class LibreTranslateConfig:
    base_url: str
    api_key: str = ""
    timeout_seconds: int = 45

    @classmethod
    def from_env(cls) -> "LibreTranslateConfig":
        url = os.environ.get("NEXUS_LIBRETRANSLATE_URL", "").rstrip("/")
        if not url:
            raise TranslationError("NEXUS_LIBRETRANSLATE_URL must point to an approved self-hosted LibreTranslate instance")
        return cls(url, os.environ.get("NEXUS_LIBRETRANSLATE_API_KEY", ""))

    def __post_init__(self):
        parsed = urlsplit(self.base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("Invalid LibreTranslate URL")
        # Unencrypted HTTP is permitted only for local sidecar/container development.
        if parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "localhost", "libretranslate"):
            raise ValueError("Use HTTPS for non-local LibreTranslate connections")

class LibreTranslateAdapter:
    def __init__(self, config: LibreTranslateConfig | None = None):
        self.config = config or LibreTranslateConfig.from_env()

    def _post(self, route: str, body: dict) -> dict:
        if self.config.api_key:
            body["api_key"] = self.config.api_key
        request = urllib.request.Request(
            self.config.base_url + route,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read(2_000_000))
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:
            raise TranslationError("LibreTranslate request failed") from exc
        if not isinstance(payload, dict) or payload.get("error"):
            raise TranslationError("LibreTranslate returned an error")
        return payload

    def translate(self, source_text: str, source: str, target: str) -> str:
        result = self._post("/translate", {
            "q": source_text,
            "source": source,
            "target": target,
            "format": "text",
        })
        translated = result.get("translatedText")
        if not isinstance(translated, str) or not translated.strip():
            raise TranslationError("LibreTranslate did not return translated text")
        return translated

def translate_medical_article(
    text: str, *, tenant_id: str, client_id: str, source_language: str = "auto",
    target_language: str = "en", config: LibreTranslateConfig | None = None,
) -> dict:
    """Translate supplied article text; preserve original/translated segment pairs.

    Tenant/client authorization, clinical review and persistence remain the responsibility
    of the calling Nexus service. Language codes follow LibreTranslate (/languages).
    """
    adapter = LibreTranslateAdapter(config)
    if source_language != "auto" and source_language == target_language:
        source = target_language
    else:
        source = source_language
    result = translate_article(
        text, tenant_id=tenant_id, client_id=client_id,
        source_language=source, target_language=target_language,
        translator=lambda fragment, src, dest: adapter.translate(fragment, src, dest),
    )
    output = result.to_dict()
    output["provider"] = "libretranslate_self_hosted"
    output["model"] = "argos_translate_via_libretranslate"
    return output
