import json
import os
from dataclasses import dataclass, field

PIPELINE_VERSION = "causality-v1.5.0"
PROMPT_VERSION = "extract-causality-v1.2"


@dataclass(frozen=True)
class Config:
    samples: int = 2
    auto_enabled: bool = False          # OFF until eval gate passes on real expert-labeled pairs
    require_policy_clauses: bool = True  # fail closed if linked GVP/SOP clause missing/unmapped/drifted
    default_method: str = "who_umc"
    tenant_methods: dict = field(default_factory=dict)   # tenant -> method id (who_umc | naranjo)
    model: str = ""                     # benchmark-driven, never hardcoded

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            samples=int(os.environ.get("CAUSALITY_SAMPLES", "2")),
            auto_enabled=os.environ.get("CAUSALITY_AUTO_ENABLED", "false").lower() == "true",
            tenant_methods=json.loads(os.environ.get("CAUSALITY_TENANT_METHODS", "{}")),
            model=os.environ.get("CAUSALITY_MODEL", ""),
        )

    def method_for(self, tenant: str) -> str:
        return self.tenant_methods.get(tenant, self.default_method)
