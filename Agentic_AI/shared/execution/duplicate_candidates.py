"""Mandatory tenant+client boundary for duplicate candidate retrieval.

The adapter deliberately does not assume a Nexus DB schema. Supply a server-owned
repository implementing list_candidates(kind, tenant_id, client_id, limit).
A browser cannot select scope or supply candidate records.
"""
from __future__ import annotations
from typing import Any, Protocol

class CandidateRepository(Protocol):
    def list_candidates(self, *, kind: str, tenant_id: str, client_id: str,
                        limit: int) -> list[dict[str, Any]]: ...

class CandidateScopeError(PermissionError):
    pass

class AuthorizedDuplicateCandidateService:
    def __init__(self, repository: CandidateRepository):
        self.repository = repository

    def retrieve(self, *, kind: str, tenant_id: str, client_id: str,
                 exclude_id: str, limit: int = 100) -> list[dict[str, Any]]:
        if kind not in ("literature", "icsr"):
            raise ValueError("unknown comparison kind")
        if not tenant_id or not client_id or not exclude_id or not 1 <= limit <= 1000:
            raise ValueError("valid scope, document and limit required")
        # Repository must enforce tenant AND client in SQL/RLS before returning rows.
        records = self.repository.list_candidates(kind=kind, tenant_id=tenant_id,
                                                  client_id=client_id, limit=limit)
        if not isinstance(records, list):
            raise CandidateScopeError("candidate repository returned invalid result")
        output = []
        for record in records:
            if not isinstance(record, dict):
                raise CandidateScopeError("invalid record")
            if record.get("tenant_id") != tenant_id or record.get("client_id") != client_id:
                # Fail entire operation: never silently ignore a storage-level isolation failure.
                raise CandidateScopeError("cross-scope candidate returned by repository")
            if record.get("record_id") != exclude_id:
                output.append(record)
        return output
