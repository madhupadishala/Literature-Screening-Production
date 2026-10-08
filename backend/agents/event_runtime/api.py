import asyncio
import hashlib
import hmac
import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException, Request as HTTPRequest
from .models import Request, Result
from .providers import LangChainProvider
from .engine import EventEngine
from .audit import AuditStore
from .coding import MedDRADictionary

MAX_BODY = 15_000_000

class BodyLimit:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        size = 0
        messages = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > MAX_BODY:
                await send({"type": "http.response.start", "status": 413, "headers": []})
                await send({"type": "http.response.body", "body": b"request too large"})
                return
            messages.append(message)
            if not message.get("more_body", False):
                break
        async def buffered_receive():
            return messages.pop(0) if messages else await receive()
        await self.app(scope, buffered_receive, send)

def create_app(engine=None, store=None, tenants=None):
    @asynccontextmanager
    async def lifespan(app):
        if app.state.engine is None:
            model = os.environ["AE_MODEL"]
            key = os.environ["AE_LLM_API_KEY"]
            dictionary = MedDRADictionary(os.environ["AE_MEDDRA_PATH"]) if os.getenv("AE_MEDDRA_PATH") else None
            from .ocr import LocalOCR
            ocr = LocalOCR() if os.getenv("AE_OCR_ENABLED") == "true" else None
            app.state.engine = EventEngine(LangChainProvider(model, key, os.getenv("AE_LLM_BASE_URL")), dictionary, ocr=ocr)
        if app.state.store is None:
            app.state.store = AuditStore(os.environ.get("AE_AUDIT_PATH", "/data/events.sqlite"))
        if app.state.tenants is None:
            # Map high-entropy API secrets to tenant IDs; never trust a caller tenant header.
            app.state.tenants = json.loads(os.environ["AE_TENANT_KEYS_JSON"])
        if not app.state.tenants or any(len(k) < 32 for k in app.state.tenants):
            raise RuntimeError("tenant API secrets must have at least 32 characters")
        yield
    app = FastAPI(title="Nexus Event Extraction", version="0.2.0", lifespan=lifespan)
    app.add_middleware(BodyLimit)
    app.state.engine, app.state.store, app.state.tenants = engine, store, tenants
    # Serial request lock bounds local cost and makes idempotency atomic for one worker.
    app.state.lock = asyncio.Lock()
    async def principal(authorization: str | None = Header(default=None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "authentication required")
        supplied = authorization[7:]
        for secret, tenant in app.state.tenants.items():
            if hmac.compare_digest(supplied, secret):
                return tenant
        raise HTTPException(401, "invalid credentials")
    @app.get("/health/live")
    async def live():
        return {"alive": True}
    @app.post("/v1/events/extract", response_model=Result)
    async def extract(body: Request, tenant=Depends(principal), idempotency_key: str = Header(min_length=1, max_length=128)):
        if app.state.lock.locked():
            raise HTTPException(429, "service busy; retry with the same idempotency key", headers={"Retry-After": "5"})
        async with app.state.lock:
            engine = app.state.engine
            from .prompts import PROMPT_VERSION
            fingerprint = json.dumps({"request": body.model_dump(), "model": engine.provider.identity,
                "prompt": PROMPT_VERSION, "version": "0.2.0",
                "dictionary": engine.dictionary.fingerprint if engine.dictionary else None}, sort_keys=True)
            digest = hashlib.sha256(fingerprint.encode()).hexdigest()
            row = app.state.store.get(tenant, idempotency_key)
            if row:
                if row[0] != digest:
                    raise HTTPException(409, "idempotency key belongs to a different input or configuration")
                return Result.model_validate_json(row[1])
            try:
                async with asyncio.timeout(1800):
                    result = await engine.run(body)
                app.state.store.save(tenant, idempotency_key, digest, result)
            except TimeoutError:
                raise HTTPException(504, "processing deadline exceeded; no complete result saved")
            except Exception:
                raise HTTPException(503, "processing or audit persistence failed")
            return result
    return app

app = create_app()
