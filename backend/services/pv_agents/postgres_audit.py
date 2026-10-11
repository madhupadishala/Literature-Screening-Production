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
        with psycopg.connect(self.database_url, connect_timeout=8) as db:
            db.execute("""CREATE TABLE IF NOT EXISTS pv_agent_service_audit (
                audit_id uuid PRIMARY KEY,
                tenant_id text NOT NULL,
                client_id text NOT NULL,
                workspace_id text NOT NULL,
                request_id text NOT NULL,
                agent text NOT NULL,
                input_sha256 char(64) NOT NULL,
                output_json jsonb NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT pv_agent_service_audit_request_unique
                  UNIQUE (tenant_id, client_id, request_id)
            )""")

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
