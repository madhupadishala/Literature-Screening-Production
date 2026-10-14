"""Authenticated transport to the existing Nexus TypeScript specialist runtime."""
from __future__ import annotations
import json
import os
import re
import urllib.request

def invoke_country_of_incident(execution, payload, knowledge):
    configuration=json.loads(os.environ.get("NEXUS_APPROVED_TS_AGENT_SERVICES_JSON","{}"))
    service=configuration.get("AG08")
    if not isinstance(service,dict) or service.get("approved") is not True:
        raise PermissionError("AG08 Next.js runtime has not been authorized")
    url=service.get("url")
    if not isinstance(url,str) or not re.fullmatch(r"https://[^?#]+",url):
        raise ValueError("Approved HTTPS Next.js runtime required")
    scoped=service.get("tenant_client_tokens",{})
    key=scoped.get(execution.tenant_id,{}).get(execution.client_id)
    if not isinstance(key,str) or len(key)<32:
        raise PermissionError("AG08 service credential not scoped to tenant/client")
    if len(payload["text"])>48000:
        raise ValueError("AG08 synchronous text limit exceeded")
    data={
        "agent_id":"AG08",
        "tenant_id":execution.tenant_id,
        "client_id":execution.client_id,
        "document_id":execution.document_id,
        "job_id":execution.job_id,
        "text":payload["text"],
        "governed_knowledge":payload["governed_knowledge"],
    }
    request=urllib.request.Request(
        url.rstrip("/")+"/api/internal/nexus-ts-agents/execute",
        data=json.dumps(data,ensure_ascii=False,allow_nan=False).encode(),
        headers={"content-type":"application/json","Authorization":"Bearer "+key},
        method="POST")
    with urllib.request.urlopen(request,timeout=55) as response:
        result=json.loads(response.read(2_000_000))
    if (not isinstance(result,dict) or result.get("agent_id")!="AG08" or
        result.get("document_id")!=execution.document_id or
        result.get("knowledge_manifest_sha256")!=knowledge["repository_manifest_sha256"]):
        raise ValueError("AG08 response identity/knowledge mismatch")
    return {"agent_id":"AG08","status":"review_required",
            "specialist_result":result["specialist_result"]}
