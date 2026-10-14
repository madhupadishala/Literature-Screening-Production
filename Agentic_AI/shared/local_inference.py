"""Local-only OpenAI-compatible model backend for Nexus PV specialists.

The endpoint MUST be on the same machine/network namespace (loopback).
There is deliberately no fallback to OpenAI/Groq or remote Ollama.
"""
from __future__ import annotations
import ipaddress
import json
import os
import urllib.parse
import urllib.request


class LocalInferenceUnavailable(RuntimeError):
    pass


def require_loopback_endpoint(url: str) -> str:
    if not isinstance(url, str) or not url:
        raise LocalInferenceUnavailable("local inference endpoint is missing")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "http" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise LocalInferenceUnavailable("local inference requires a plain loopback HTTP endpoint")
    try:
        host = parsed.hostname
        if host != "localhost" and not ipaddress.ip_address(host).is_loopback:
            raise LocalInferenceUnavailable("inference endpoint is not loopback")
    except ValueError as exc:
        raise LocalInferenceUnavailable("inference endpoint is not loopback") from exc
    if parsed.port is None or parsed.port <= 0:
        raise LocalInferenceUnavailable("local inference endpoint requires explicit port")
    return url.rstrip("/")


class LocalOnlyMedicalLLM:
    """Synchronous JSON-schema output through a co-located model server."""

    def __init__(self):
        mode = os.environ.get("NEXUS_PV_INFERENCE_MODE", "disabled")
        if mode != "local_only":
            raise LocalInferenceUnavailable("Nexus PV local inference not enabled")
        self.endpoint = require_loopback_endpoint(
            os.environ.get("NEXUS_PV_LOCAL_OPENAI_BASE_URL", ""))
        self.model = os.environ.get("NEXUS_PV_LOCAL_MODEL", "").strip()
        if not self.model:
            raise LocalInferenceUnavailable("local model has not been configured")

    def complete_json(self, *, system: str, user: str, schema: dict) -> dict:
        body = json.dumps({
            "model": self.model, "temperature": 0,
            "stream": False,
            "response_format": {"type":"json_schema","json_schema":{
                "name":"pv_extraction","strict":True,"schema":schema}},
            "messages":[{"role":"system","content":system},
                        {"role":"user","content":user}],
        },ensure_ascii=False).encode()
        if len(body)>150000:
            raise LocalInferenceUnavailable("local inference request too large")
        request = urllib.request.Request(
            self.endpoint + "/chat/completions",data=body,method="POST",
            headers={"Content-Type":"application/json"})
        # Disable environment-supplied HTTP proxies: request must stay local.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                          urllib.request.HTTPRedirectHandler())
        try:
            with opener.open(request,timeout=60) as response:
                if response.geturl() != request.full_url:
                    raise LocalInferenceUnavailable("redirect refused")
                response_body=response.read(2_000_001)
            if len(response_body)>2_000_000:
                raise LocalInferenceUnavailable("inference output too large")
            parsed=json.loads(response_body)
            result=json.loads(parsed["choices"][0]["message"]["content"])
            if not isinstance(result,dict):
                raise ValueError("model output not an object")
            return result
        except (OSError, ValueError, KeyError, IndexError) as exc:
            raise LocalInferenceUnavailable("co-located model unavailable or invalid output") from exc
