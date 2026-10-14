"""Load canonical Kimi8 source files into their original shared package namespace.

Preserves real source implementations, while controlled Nexus KB provides rules.
Never loads user-supplied module paths or arbitrary names.
"""
from __future__ import annotations
import importlib.util
import sys
from pathlib import Path
from .schemas import ICSR, LiteratureArticle

SOURCES = {
 "AG06": ("AG06_Medical_History_Extraction","med_history","MedicalHistoryAgent"),
 "AG14": ("AG14_Dechallenge_Assessment","dechallenge","DechallengeAgent"),
 "AG15": ("AG15_Rechallenge_Assessment","rechallenge","RechallengeAgent"),
 "AG18": ("AG18_Literature_Duplicate_Detection","lit_duplicate","LiteratureDuplicateAgent"),
 "AG19": ("AG19_ICSR_Duplicate_Detection","icsr_duplicate","IcsrDuplicateAgent"),
 "AG21": ("AG21_Followup_Questionnaire","followup","FollowUpQuestionnaireAgent"),
 "AG22": ("AG22_Inclusion_Exclusion","inclusion_exclusion","InclusionExclusionAgent"),
 "AG23": ("AG23_Action_Taken","action_taken","ActionTakenAgent"),
}
ROOT = Path(__file__).resolve().parents[2]
PREFIX = "Agentic_AI.shared.kimi8_core.agents"

def load_specialist(agent_id: str):
    if agent_id not in SOURCES:
        raise ValueError("Unsupported Kimi8 specialist")
    folder, name, cls = SOURCES[agent_id]
    fullname = PREFIX + "." + name
    if fullname not in sys.modules:
        source = ROOT / folder / "src" / "kimi8" / (name + ".py")
        spec = importlib.util.spec_from_file_location(fullname, source)
        if spec is None or spec.loader is None:
            raise ValueError("Kimi8 canonical source missing")
        module = importlib.util.module_from_spec(spec)
        sys.modules[fullname] = module
        try:
            spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(fullname, None)
            raise
    return getattr(sys.modules[fullname], cls)

class NexusRuleRegister:
    """Only explicitly referenced, approved citations can satisfy mandatory rules."""
    def __init__(self, kb: dict):
        self.rules = {
            c.get("regulatoryReference")
            for c in kb["citations"]
            if isinstance(c.get("regulatoryReference"),str)
            and c.get("repositoryManifestSha256")==kb["repository_manifest_sha256"]
        }
    def require_approved(self, requirement_ids):
        missing = sorted(set(requirement_ids)-self.rules)
        if missing:
            raise PermissionError("Missing approved controlled regulatory requirements: "+", ".join(missing))

def invoke_kimi8(agent_id: str, payload: dict, kb: dict) -> dict:
    cls = load_specialist(agent_id)
    agent = cls(register=NexusRuleRegister(kb))
    if agent_id == "AG18":
        incoming = LiteratureArticle.model_validate(payload["article"])
        existing = LiteratureArticle.model_validate(payload["existing_article"])
        result = agent.assess_pair(incoming, existing)
    elif agent_id == "AG22":
        incoming = LiteratureArticle.model_validate(payload["article"])
        scope = [p["trade_name"] for p in kb["client_products"]]
        result = agent.screen(incoming, scope,
            duplicate_suspected=bool(payload.get("duplicate_suspected",False)))
    else:
        case = ICSR.model_validate(payload["case"])
        if case.narrative and case.narrative.strip() not in payload["text"]:
            raise ValueError("Structured case narrative does not match authorized source")
        if agent_id == "AG06":
            result = agent.extract(case)
        elif agent_id == "AG14":
            result = agent.assess(case)
        elif agent_id == "AG15":
            result = agent.assess(case)
        elif agent_id == "AG19":
            other = ICSR.model_validate(payload["existing_case"])
            result = agent.compare(case, other)
        elif agent_id == "AG21":
            result = agent.generate(case)
        elif agent_id == "AG23":
            result = agent.extract(case)
        else:
            raise ValueError("Unsupported specialist")
    if result.status.value == "processing_failure":
        raise RuntimeError("Specialist processing failure")
    return {"agent_id":agent_id,"status":result.status.value,
            "specialist_result":result.model_dump(mode="json")}
