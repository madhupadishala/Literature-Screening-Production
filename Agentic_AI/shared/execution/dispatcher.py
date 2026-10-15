"""Strict 27-agent registry. Recovered files are not automatically executable."""
from __future__ import annotations
import json
from pathlib import Path
from typing import Callable
from .base import BaseExecutionAdapter, ExecutionFailure

class AgentNotReady(ExecutionFailure):
    pass

class AgentDispatcher:
    def __init__(self, *, router, secret: bytes, specialists: dict[str, Callable] | None = None):
        registry_path = Path(__file__).resolve().parents[1] / "agent_context_registry.json"
        self.registry = json.loads(registry_path.read_text(encoding="utf-8"))
        if set(self.registry) != {f"AG{i:02d}" for i in range(1, 28)}:
            raise ExecutionFailure("27-agent registry contract mismatch")
        self.router = router
        self.secret = secret
        self.specialists = {}
        for agent_id, fn in (specialists or {}).items():
            if agent_id not in self.registry or not callable(fn):
                raise ExecutionFailure("unknown agent or invalid specialist")
            self.specialists[agent_id] = BaseExecutionAdapter(agent_id, fn, router, secret)

    def readiness(self) -> dict[str, str]:
        return {id: ("bound_unqualified" if id in self.specialists else "not_bound")
                for id in self.registry}

    def execute(self, agent_id: str, *, envelope: dict, evidence: dict,
                expected_tenant: str, expected_client: str) -> dict:
        if agent_id not in self.registry:
            raise ExecutionFailure("unknown agent")
        if agent_id not in self.specialists:
            raise AgentNotReady(f"{agent_id} specialist implementation is not connected")
        return self.specialists[agent_id].execute(
            envelope=envelope, evidence=evidence,
            expected_tenant=expected_tenant, expected_client=expected_client)
