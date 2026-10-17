"""Approved, server-configured structured JSON gateway for Nexus Batch-1 agents.

Network use is opt-in: no URL is read from the evidence, no public provider
fallback exists, and no request is made unless the trusted host explicitly
instantiates this class. The gateway MUST be approved to process the supplied
data; testing uses an injected transport instead of sending clinical data.
Contract: POST {model, system, user, schema} -> {output: JSON object}.
"""
from __future__ import annotations

import json
import os
import ssl
from dataclasses import dataclass
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPSHandler, HTTPHandler
from urllib.error import HTTPError, URLError

class StructuredProviderUnavailable(RuntimeError):
    pass

@dataclass(frozen=True)
class PrivateStructuredJSONClient:
    endpoint: str
    model: str
    bearer_token: str
    allowed_hosts: frozenset[str]
    timeout_seconds: float = 25
    max_response_bytes: int = 256_000
    transport: object | None = None

    def __post_init__(self):
        parsed = urlsplit(self.endpoint)
        if parsed.scheme not in ("https", "http") or not parsed.hostname:
            raise ValueError("Explicit approved HTTP(S) JSON gateway endpoint required")
        if parsed.username or parsed.password or parsed.fragment:
            raise ValueError("Unsafe provider endpoint")
        host = parsed.hostname.lower()
        if not self.allowed_hosts or host not in self.allowed_hosts:
            raise ValueError("Provider host is not allowlisted")
        if parsed.scheme == "http" and host not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError("Unencrypted provider transport must stay on loopback")
        if not self.model.strip() or not self.bearer_token or not 0 < self.timeout_seconds <= 90:
            raise ValueError("Model, server credential and bounded timeout required")
        if not 4096 <= self.max_response_bytes <= 1_000_000:
            raise ValueError("Invalid response byte budget")

    @classmethod
    def from_server_env(cls, *, transport=None):
        """Only a trusted backend may load these environment variables."""
        url = os.environ["NEXUS_PV_APPROVED_JSON_LLM_URL"]
        parsed = urlsplit(url)
        configured = os.environ["NEXUS_PV_APPROVED_JSON_LLM_HOSTS"]
        hosts = frozenset(x.strip().lower() for x in configured.split(",") if x.strip())
        return cls(
            endpoint=url,
            model=os.environ["NEXUS_PV_APPROVED_JSON_LLM_MODEL"],
            bearer_token=os.environ["NEXUS_PV_APPROVED_JSON_LLM_TOKEN"],
            allowed_hosts=hosts,
            transport=transport,
        )

    def complete_json(self, *, system: str, user: str, schema: dict) -> dict:
        if not isinstance(system, str) or not isinstance(user, str) or not isinstance(schema, dict):
            raise TypeError("Structured gateway requires system, user and JSON schema")
        if not user.strip() or len(user) > 150_000 or len(system) > 30_000:
            raise ValueError("Source text outside approved provider budget")
        body = json.dumps({"model": self.model, "system": system, "user": user,
                           "schema": schema}, separators=(",", ":")).encode("utf-8")
        if len(body) > 500_000:
            raise ValueError("Provider payload outside approved budget")
        req = Request(self.endpoint, data=body, method="POST",
                      headers={"Content-Type":"application/json",
                               "Authorization":"Bearer "+self.bearer_token,
                               "Accept":"application/json"})
        try:
            if self.transport is not None:
                response = self.transport(req, self.timeout_seconds)
            else:
                # A no-redirect handler prevents credentials/source from following
                # a 30x response to another origin, even on allowlisted hosts.
                from urllib.request import HTTPRedirectHandler
                class RejectRedirects(HTTPRedirectHandler):
                    def redirect_request(self, request, fp, code, msg, headers, newurl):
                        raise StructuredProviderUnavailable("Gateway redirect denied")
                opener = build_opener(RejectRedirects(), HTTPSHandler(context=ssl.create_default_context()),
                                      HTTPHandler())
                response = opener.open(req, timeout=self.timeout_seconds)
            with response as stream:
                if getattr(stream, "status", 200) != 200:
                    raise StructuredProviderUnavailable("Approved provider unavailable")
                payload = stream.read(self.max_response_bytes + 1)
            if len(payload) > self.max_response_bytes:
                raise StructuredProviderUnavailable("Provider response too large")
            answer = json.loads(payload)
            if not isinstance(answer, dict) or not isinstance(answer.get("output"), dict):
                raise StructuredProviderUnavailable("Invalid approved provider JSON envelope")
            return answer["output"]
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, UnicodeError) as exc:
            # Do not leak URLs, provider tokens, source or medical data through errors.
            raise StructuredProviderUnavailable("Approved structured provider unavailable") from None
