import hmac
import json
import os

from fastapi import Depends, FastAPI, Header, HTTPException

from .audit import AuditLog
from .config import Config
from .extraction import AnthropicExtractor
from .kb import KnowledgeStore, load_kb_dir
from .pipeline import CausalityPipeline, LabelTable
from .schemas import CaseAssessment, CaseInput


def build_default_pipeline() -> CausalityPipeline:
    cfg = Config.from_env()
    store = KnowledgeStore()
    if os.environ.get("CAUSALITY_KB_DIR"):
        load_kb_dir(store, os.environ["CAUSALITY_KB_DIR"])
    pins = json.load(open(os.environ["CAUSALITY_PINS"])) if os.environ.get("CAUSALITY_PINS") else {}
    labels = json.load(open(os.environ["CAUSALITY_LABELS"])) if os.environ.get("CAUSALITY_LABELS") else {}
    audit = AuditLog(os.environ.get("CAUSALITY_AUDIT_DB", "audit.db"))
    return CausalityPipeline(AnthropicExtractor(cfg.model), audit, cfg, store, pins,
                             label_table=LabelTable(labels))


def create_app(pipeline: CausalityPipeline | None = None, api_keys: dict[str, str] | None = None) -> FastAPI:
    pipe = pipeline or build_default_pipeline()
    keys = api_keys if api_keys is not None else json.loads(os.environ.get("CAUSALITY_API_KEYS", "{}"))
    app = FastAPI(title="Nexus Causality Agent", version="0.1.0")

    def tenant(x_api_key: str | None = Header(default=None)) -> str:
        if x_api_key:
            for k, t in keys.items():
                if hmac.compare_digest(k.encode(), x_api_key.encode()):
                    return t
        raise HTTPException(status_code=401, detail="invalid credentials")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/v1/agents/causality/assess", response_model=CaseAssessment)
    def assess(case: CaseInput, tenant_id: str = Depends(tenant)):
        return pipe.assess(case, tenant_id)

    return app
