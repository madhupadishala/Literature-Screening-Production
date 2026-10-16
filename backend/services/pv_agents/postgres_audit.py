"""PostgreSQL-backed, append-only PV specialist audit storage.

Requires a staging-only PostgreSQL URL with an isolated database role.
Never store source narratives or bearer tokens in this table.
"""
import json
import os
from uuid import uuid4

from .service import ServiceError


class PostgresAuditStore:
    def __init__(self, database_url):
        if not database_url or not database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("A PostgreSQL audit database URL is required")
        import psycopg
        self.database_url = database_url
        # Migrations run using a separate administrative role. The service role
        # intentionally has SELECT/INSERT only: never grant it CREATE or UPDATE.
        with psycopg.connect(self.database_url, connect_timeout=8) as db:
            db.execute("SELECT 1 FROM public.pv_agent_service_audit LIMIT 0")

    def append(self, request, agent, output):
        from psycopg.errors import UniqueViolation
        from psycopg.types.json import Jsonb
        import psycopg

        audit_id = str(uuid4())
        record = {**output, "audit_id": audit_id}
        try:
            with psycopg.connect(self.database_url, connect_timeout=8) as db:
                db.execute("""INSERT INTO pv_agent_service_audit
                    (audit_id, tenant_id, client_id, workspace_id, request_id, agent,
                     input_sha256, output_json)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""", (
                        audit_id, request["tenant_id"], request["client_id"],
                        request["workspace_id"], request["request_id"], agent,
                        record["input_sha256"], Jsonb(record),
                    ))
        except UniqueViolation as exc:
            raise ServiceError(409, "Request ID already recorded") from exc
        return record
