import hmac
import json
import os

from fastapi import Depends, FastAPI, Header, HTTPException

from .audit import AuditLog
from .config import Config
from .extraction import AnthropicExtractor
from .pipeline import SeriousnessPipeline
from .schemas import CaseInput, Decision


def build_default_pipeline() -> SeriousnessPipeline:
    cfg = Config.from_env()
    audit = AuditLog(os.environ.get("SERIOUSNESS_AUDIT_DB", "audit.db"))
    return SeriousnessPipeline(AnthropicExtractor(cfg.model), audit, cfg)


def create_app(pipeline: SeriousnessPipeline | None = None, api_keys: dict[str, str] | None = None) -> FastAPI:
    pipe = pipeline or build_default_pipeline()
    keys = api_keys if api_keys is not None else json.loads(os.environ.get("SERIOUSNESS_API_KEYS", "{}"))
    app = FastAPI(title="Nexus Seriousness Agent", version="0.1.0")

    def tenant(x_api_key: str | None = Header(default=None)) -> str:
        if x_api_key:
            for k, t in keys.items():
                if hmac.compare_digest(k.encode(), x_api_key.encode()):
                    return t
        raise HTTPException(status_code=401, detail="invalid credentials")

    @app.get("/healthz")
    def healthz():
        return {"ok": True}

    @app.post("/v1/agents/seriousness/assess", response_model=Decision)
    def assess(case: CaseInput, tenant_id: str = Depends(tenant)):
        return pipe.assess(case, tenant_id)

    return app
