"""Authenticated transport to the existing Nexus TypeScript specialist runtime."""
from __future__ import annotations
import json
import os
import re
import urllib.request

TS_AGENT_IDS = frozenset(("AG08","AG12","AG17","AG20","AG26"))

def invoke_typescript_specialist(execution, payload, knowledge):
    agent_id=execution.agent_id
    if agent_id not in TS_AGENT_IDS:
        raise ValueError("Unsupported TypeScript agent")
    configuration=json.loads(os.environ.get("NEXUS_APPROVED_TS_AGENT_SERVICES_JSON","{}"))
    service=configuration.get(agent_id)
    if not isinstance(service,dict) or service.get("approved") is not True:
        raise PermissionError("Next.js specialist runtime has not been authorized")
    url=service.get("url")
    if not isinstance(url,str) or not re.fullmatch(r"https://[^?#]+",url):
        raise ValueError("Approved HTTPS Next.js runtime required")
    scoped=service.get("tenant_client_tokens",{})
    key=scoped.get(execution.tenant_id,{}).get(execution.client_id)
    if not isinstance(key,str) or len(key)<32:
        raise PermissionError("Specialist service credential not scoped to tenant/client")
    if len(payload["text"])>100000:
        raise ValueError("Specialist source length exceeded")
    data={
        "agent_id":agent_id,
        "tenant_id":execution.tenant_id,
        "client_id":execution.client_id,
        "document_id":execution.document_id,
        "job_id":execution.job_id,
        "text":payload["text"],
        "governed_knowledge":payload["governed_knowledge"],
        "specialist_input":payload.get("specialist_input",{}),
    }
    request=urllib.request.Request(
        url.rstrip("/")+"/api/internal/nexus-ts-agents/execute",
        data=json.dumps(data,ensure_ascii=False,allow_nan=False).encode(),
        headers={"content-type":"application/json","Authorization":"Bearer "+key},
        method="POST")
    with urllib.request.urlopen(request,timeout=55) as response:
        result=json.loads(response.read(2_000_000))
    if (not isinstance(result,dict) or result.get("agent_id")!=agent_id or
        result.get("document_id")!=execution.document_id or
        result.get("knowledge_manifest_sha256")!=knowledge["repository_manifest_sha256"]):
        raise ValueError("TypeScript response identity/knowledge mismatch")
    return {"agent_id":agent_id,"status":"review_required",
            "specialist_result":result["specialist_result"]}
