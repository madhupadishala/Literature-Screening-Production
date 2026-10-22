"""Active Qdrant canary probe. Uses a dedicated pre-provisioned index, never clinical vectors."""
import json
import math
import os
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4


def probe_vector(*, environ=None, transport=None):
    env = os.environ if environ is None else environ
    started = time.monotonic()
    result = {"vector_ready": False, "index_status": "unavailable", "probe_scope": "isolated_canary", "clinical_index_verified": False}
    try:
        endpoint = env.get("QDRANT_URL", "").rstrip("/")
        parsed = urlsplit(endpoint)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("vector_not_configured")
        collection = env.get("NEXUS_VECTOR_PROBE_COLLECTION", "nexus_health_probe")
        if collection != "nexus_health_probe":
            raise ValueError("dedicated_probe_collection_required")
        size = int(env.get("NEXUS_VECTOR_PROBE_DIMENSIONS", "8"))
        if not 2 <= size <= 4096: raise ValueError("invalid_probe_dimensions")
        def http(method, path, body=None):
            headers = {"Content-Type": "application/json"}
            if env.get("QDRANT_API_KEY"): headers["api-key"] = env["QDRANT_API_KEY"]
            request = Request(endpoint + path, method=method, headers=headers,
                              data=None if body is None else json.dumps(body).encode())
            # Do not follow redirects to another credential recipient.
            from urllib.request import build_opener, HTTPRedirectHandler
            class NoRedirect(HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs): return None
            with build_opener(NoRedirect).open(request, timeout=2) as response:
                return json.loads(response.read(262144))
        send = transport or http
        root = '/collections/' + collection
        info = send('GET', root)['result']
        if info.get('status') != 'green': raise RuntimeError('index_not_ready')
        vector = [1.0] + [0.0] * (size - 1)
        canary = str(uuid4())
        written = False
        try:
            # Even an ambiguous timeout may have committed the point: always attempt cleanup.
            written = True
            response = send('PUT', root + '/points?wait=true', {"points": [{"id": canary, "vector": vector,
                "payload": {"probe_id": canary, "tenantKey": "nexus-health", "workspaceId": "nexus-health"}}]})
            if response.get('result', {}).get('status') != 'completed': raise RuntimeError('index_write_not_completed')
            found = send('POST', root + '/points/search', {"vector": vector, "limit": 1,
                "filter": {"must": [{"key": "probe_id", "match": {"value": canary}},
                                     {"key": "tenantKey", "match": {"value": "nexus-health"}},
                                     {"key": "workspaceId", "match": {"value": "nexus-health"}}]}})['result']
            if not found or str(found[0].get('id')) != canary or not math.isfinite(found[0].get('score', float('nan'))):
                raise RuntimeError('index_readback_failed')
        finally:
            if written:
                cleaned = send('POST', root + '/points/delete?wait=true', {"points": [canary]})
                if cleaned.get('result', {}).get('status') != 'completed': raise RuntimeError('probe_cleanup_failed')
        result.update(vector_ready=True, index_status='synced', checks=['collection_ready', 'write_acknowledged', 'similarity_readback', 'cleanup_acknowledged'])
    except Exception as exc:
        # Never disclose credentials, endpoint internals, or provider error bodies.
        result['reason'] = 'vector_not_configured' if isinstance(exc, ValueError) and str(exc) == 'vector_not_configured' else 'vector_probe_failed'
    result['latency_ms'] = round((time.monotonic() - started) * 1000, 2)
    return result

# Public readiness polling must not become an unbounded index-write endpoint.
from threading import Lock
_cache_lock = Lock()
_cache = None
_checked = 0.0

def cached_vector_probe():
    global _cache, _checked
    with _cache_lock:
        now = time.monotonic()
        if _cache is None or now - _checked >= 30:
            _cache = probe_vector()
            _checked = time.monotonic()
        return dict(_cache)
