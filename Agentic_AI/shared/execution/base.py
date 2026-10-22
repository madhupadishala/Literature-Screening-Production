"""Execution boundary: verify job context before scoped knowledge lookup or engine invocation."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Any
from Agentic_AI.shared.workflow_context import verify_context, bind_result

class ExecutionFailure(RuntimeError):
    pass

@dataclass
class BaseExecutionAdapter:
    agent_id: str
    specialist: Callable[[dict, Any], dict]
    router: Any
    secret: bytes

    def execute(self, *, envelope: dict, evidence: dict, expected_tenant: str, expected_client: str) -> dict:
        context = verify_context(envelope, expected_agent=self.agent_id,
                                 signing_secret=self.secret,
                                 expected_tenant=expected_tenant,
                                 expected_client=expected_client)
        if self.agent_id in ("AG03", "AG04", "AG09", "AG24"):
            from .v25_bindings import BATCH1_ROUTES
            if context.module_id not in BATCH1_ROUTES[self.agent_id]["modules"]:
                raise ExecutionFailure("agent not authorized for requested module")
        if self.agent_id in ("AG02", "AG08", "AG12", "AG17", "AG20", "AG26"):
            from .native_runtime_bindings import RUNTIME_ROUTES
            if context.module_id not in RUNTIME_ROUTES[self.agent_id]["module"]:
                raise ExecutionFailure("native runtime agent not authorized for requested module")
        if self.agent_id in ("AG11", "AG13") and context.module_id != "case_processing":
            raise ExecutionFailure("clinical native pipeline not authorized for requested module")
        if not isinstance(evidence, dict):
            raise ExecutionFailure("evidence must be an object")
        if not isinstance(evidence.get("text", ""), str):
            raise ExecutionFailure("invalid evidence text")
        if evidence.get("document_id") != context.document_id:
            raise ExecutionFailure("document identity mismatch")
        # No browser-selected knowledge scope, tenant or client is trusted.
        pack = self.router.build_context_pack(
            tenant_id=context.tenant_id,
            client_id=context.client_id,
            agent_name=self.agent_id,
            task=context.task_type,
            evidence_package=evidence,
        )
        if pack.tenant_id != context.tenant_id or getattr(pack, "client_id", None) != context.client_id:
            raise ExecutionFailure("knowledge scope mismatch")
        # Never pass unverified model-generated identity into downstream routing.
        output = self.specialist(evidence, pack)
        if not isinstance(output, dict):
            raise ExecutionFailure("specialist must return a mapping")
        return bind_result(context, {
            "status": "review_required",
            "assessment": output,
            "knowledge_citations": list(pack.citations),
        })
