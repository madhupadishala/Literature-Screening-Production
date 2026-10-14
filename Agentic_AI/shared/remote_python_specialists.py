"""Tenant-scoped clients for canonical AG02, AG11 and AG13 service APIs.

Never use global shared API credentials for different tenants. No local
knowledge or provider fallback. Endpoint configuration is server-side only.
"""
from __future__ import annotations
import base64
import json
import os
import re
import urllib.request
from typing import Any

PATHS = {
    "AG02": "/v1/events/extract",
    "AG11": "/v1/agents/seriousness/assess",
    "AG13": "/v1/agents/causality/assess",
}

def _settings(execution, agent_id):
    raw=os.environ.get("NEXUS_APPROVED_AGENT_SERVICES_JSON","")
    if not raw:
        raise PermissionError("Approved specialist service registry is not configured")
    registry=json.loads(raw)
    server=registry.get(agent_id)
    if not isinstance(server,dict) or server.get("approved") is not True:
        raise PermissionError("Specialist service not approved")
    url=server.get("url")
    if not isinstance(url,str) or not re.fullmatch(r"https://[^?#]+",url):
        raise ValueError("Approved HTTPS specialist service URL required")
    tokens=server.get("tenant_tokens")
    key=tokens.get(execution.tenant_id) if isinstance(tokens,dict) else None
    if not isinstance(key,str) or len(key)<32:
        raise PermissionError("No explicitly scoped credential for current tenant")
    return url.rstrip("/"),key

def _call(execution, agent_id, body):
    endpoint, token = _settings(execution,agent_id)
    headers={"Content-Type":"application/json"}
    if agent_id == "AG02":
        headers["Authorization"]="Bearer "+token
        headers["idempotency-key"]=execution.job_id
    else:
        headers["x-api-key"]=token
    data=json.dumps(body,ensure_ascii=False,allow_nan=False).encode()
    if len(data)>1_000_000:
        raise ValueError("Specialist service payload too large")
    request=urllib.request.Request(endpoint+PATHS[agent_id],
        data=data,headers=headers,method="POST")
    with urllib.request.urlopen(request,timeout=40) as response:
        result=json.loads(response.read(2_000_000))
    if not isinstance(result,dict):
        raise ValueError("Remote specialist returned invalid object")
    return result

def invoke_remote_python(execution: Any, payload: dict, knowledge: dict) -> dict:
    agent_id=execution.agent_id
    if agent_id=="AG02":
        body={"case_id":execution.document_id,"documents":[{
          "id":execution.document_id,"media_type":"text/plain",
          "content_base64":base64.b64encode(payload["text"].encode()).decode(),
          "source_type":payload.get("source_type","unknown")
        }]}
    elif agent_id=="AG11":
        terms=payload.get("event_terms",[])
        if not isinstance(terms,list) or not all(
            isinstance(t,str) and t.strip().casefold() in payload["text"].casefold()
            for t in terms):
            raise ValueError("Seriousness event terms must be source-grounded")
        body={"case_id":execution.document_id,
              "narrative":payload["text"][:50000],
              "event_terms":terms,
              "reporter_serious":payload.get("reporter_serious")}
    elif agent_id=="AG13":
        if os.environ.get("NEXUS_CAUSALITY_CLIENT_KB_VALIDATED")!="true":
            raise PermissionError("Client-specific causality KB qualification not confirmed")
        body=payload.get("causality_case")
        if not isinstance(body,dict):
            raise ValueError("Structured causality case required")
        if body.get("case_id") != execution.document_id or body.get("narrative") != payload["text"]:
            raise ValueError("Causality case must match authorized source identity and text")
        if not knowledge["citations"]:
            raise PermissionError("Causality must have approved controlled evidence")
    else:
        raise ValueError("Unsupported specialist service")
    result=_call(execution,agent_id,body)
    if agent_id in ("AG02","AG11") and result.get("case_id")!=execution.document_id:
        raise ValueError("Remote specialist case identity mismatch")
    return {"agent_id":agent_id,"status":"review_required",
            "specialist_result":result}
