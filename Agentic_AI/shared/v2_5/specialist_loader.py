"""Verified v2.5 source loader, provider boundary and per-agent invocation.

Uses the original AG03/04/09/24 implementations and a configured approved
enterprise medical LLM endpoint. No provider fallback, no unapproved PII egress.
"""
from __future__ import annotations
import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "Agentic_AI.shared.v2_5"
SOURCES = {
  "AG03": ("AG03_Patient_Identification","patient","PatientAgent"),
  "AG04": ("AG04_Reporter_Identification","reporter","ReporterAgent"),
  "AG09": ("AG09_Clock_Start_Date","day_zero","DayZeroAgent"),
  "AG24_history": ("AG24_Clinical_History_Capture","history","HistoricalAgent"),
  "AG24_current": ("AG24_Clinical_History_Capture","current","CurrentAgent"),
}


def load_source(key):
    if key not in SOURCES:
        raise ValueError("Unrecognized v2.5 specialist")
    folder, part, classname = SOURCES[key]
    package = PREFIX + "." + part
    if package not in sys.modules:
        module = ModuleType(package)
        module.__path__ = []
        sys.modules[package] = module
    name = package + ".agent"
    if name not in sys.modules:
        path = ROOT / folder / "src" / "v2_5" / part / "agent.py"
        spec = importlib.util.spec_from_file_location(name, path)
        if spec is None or spec.loader is None:
            raise ValueError("Canonical v2.5 source missing")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(name,None)
            raise
    return getattr(sys.modules[name],classname)


class ApprovedMedicalLLM:
    def __init__(self):
        endpoint=os.environ.get("NEXUS_APPROVED_MEDICAL_LLM_ENDPOINT","")
        model=os.environ.get("NEXUS_APPROVED_MEDICAL_LLM_MODEL","")
        key=os.environ.get("NEXUS_APPROVED_MEDICAL_LLM_TOKEN","")
        approved=os.environ.get("NEXUS_PV_PII_PROVIDER_APPROVED","").lower()=="true"
        if not approved or not endpoint.startswith("https://") or not model or not key:
            raise PermissionError("Approved PV/PII LLM provider is not configured")
        self.endpoint,self.model,self.key=endpoint,model,key

    def complete_json(self, *, system: str, user: str, schema: dict) -> dict:
        body=json.dumps({"model":self.model,"temperature":0,
              "messages":[{"role":"system","content":system},
                          {"role":"user","content":user}],
              "response_format":{"type":"json_schema",
                  "json_schema":{"name":"nexus_extraction","strict":True,"schema":schema}}}).encode()
        request=urllib.request.Request(self.endpoint,data=body,method="POST",
             headers={"Authorization":"Bearer "+self.key,"Content-Type":"application/json"})
        with urllib.request.urlopen(request,timeout=45) as response:
            raw=response.read(2_000_000)
        result=json.loads(raw)
        output=result["choices"][0]["message"]["content"]
        parsed=json.loads(output)
        if not isinstance(parsed,dict):
            raise ValueError("Approved LLM returned invalid structured response")
        return parsed


def invoke_v25(agent_id: str, payload: dict, knowledge: dict) -> dict:
    # Never invoke provider until Nexus KB tenant/client scope was validated.
    if os.environ.get("NEXUS_PV_INFERENCE_MODE") == "local_only":
        from Agentic_AI.shared.local_inference import LocalOnlyMedicalLLM
        provider = LocalOnlyMedicalLLM()
    else:
        raise PermissionError("Nexus PV external LLM inference is disabled; local_only required")
    if agent_id=="AG09":
        from Agentic_AI.shared.v2_5.common.base import grounded
        module=load_source("AG09")
        from importlib import import_module
        source_module=import_module(PREFIX+".day_zero.agent")
        values=payload.get("day_zero_input")
        if not isinstance(values,dict):
            raise ValueError("Day zero requires validated receipt event records")
        for receipt in values.get("receipts",[]):
            if not isinstance(receipt,dict) or not isinstance(receipt.get("text"),str):
                raise ValueError("Invalid receipt event")
            if receipt["text"].strip() not in payload["text"]:
                raise ValueError("Receipt text not grounded in source")
        result=module(provider).run(source_module.DayZeroInput.model_validate(values))
    elif agent_id=="AG24":
        h=load_source("AG24_history")(provider).run(
            payload["text"],payload.get("reaction_onset_date"))
        c=load_source("AG24_current")(provider).run(
            payload["text"],payload.get("reaction_onset_date"))
        return {"agent_id":"AG24","status":"review_required",
                "historical":h.model_dump(mode="json"),
                "current":c.model_dump(mode="json")}
    else:
        cls=load_source(agent_id)
        result=cls(provider).run(payload["text"])
    return {"agent_id":agent_id,"status":"review_required",
            "specialist_result":result.model_dump(mode="json")}
