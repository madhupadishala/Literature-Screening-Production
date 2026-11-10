import json
from typing import Protocol
from .models import Block, Extraction, Verification
from .prompts import EXTRACT, VERIFY

class Provider(Protocol):
    identity: str
    async def extract(self, block: Block) -> Extraction: ...
    async def verify(self, block: Block, extraction: Extraction) -> Verification: ...

class LangChainProvider:
    def __init__(self, model: str, api_key: str, base_url: str | None = None):
        from langchain_openai import ChatOpenAI
        self.identity = model
        self.model = ChatOpenAI(model=model, api_key=api_key, base_url=base_url,
                                temperature=0, timeout=45, max_retries=2)
        self.extractor = self.model.with_structured_output(Extraction, method="json_schema")
        self.verifier = self.model.with_structured_output(Verification, method="json_schema")

    async def extract(self, block):
        value = await self.extractor.ainvoke([("system", EXTRACT), ("human", block.model_dump_json())])
        return Extraction.model_validate(value)

    async def verify(self, block, extraction):
        value = await self.verifier.ainvoke([("system", VERIFY), ("human", json.dumps({
            "block": block.model_dump(), "proposals": extraction.model_dump()}, ensure_ascii=False))])
        return Verification.model_validate(value)
