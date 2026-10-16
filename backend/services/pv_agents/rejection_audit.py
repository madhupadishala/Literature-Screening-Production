"""Durable, sanitized diagnostic rejection events; no patient source or bearer secrets."""
from __future__ import annotations
import json
from uuid import uuid4

_ALLOWED = {"agent_id","expected_tenant","expected_client","event","error_type"}

def durable_rejection_audit_callback(database_url: str):
    """Construct callback only after the rejection table migration is applied.

    Uses a dedicated INSERT-only DB role; never allow arbitrary SQL or source
    narrative to enter audit details. An audit write failure is not swallowed.
    """
    if not database_url.startswith(("postgresql://","postgres://")):
        raise ValueError("PostgreSQL audit URL required")
    def append(event: dict):
        if not isinstance(event,dict) or set(event)!=_ALLOWED:
            raise ValueError("Unexpected audit fields")
        if event["event"]!="specialist_execution_rejected":
            raise ValueError("Unknown audit event")
        for key in _ALLOWED:
            if not isinstance(event[key],str) or not event[key] or len(event[key])>128:
                raise ValueError("Invalid rejection audit metadata")
        import psycopg
        with psycopg.connect(database_url,connect_timeout=8) as conn:
            conn.execute("SELECT set_config(%s,%s,true)", ("nexus.audit_tenant",event["expected_tenant"]))
            conn.execute("SELECT set_config(%s,%s,true)", ("nexus.audit_client",event["expected_client"]))
            conn.execute(
                """INSERT INTO public.pv_agent_rejection_audit
                     (event_id,agent_id,tenant_id,client_id,event_type,error_type)
                     VALUES (%s,%s,%s,%s,%s,%s)""",
                (str(uuid4()),event["agent_id"],event["expected_tenant"],
                 event["expected_client"],event["event"],event["error_type"]))
    return append
