"""Offline durable rejection audit contract: parameterized INSERT, sanitized fields."""
import sys
import types
import unittest
from unittest.mock import patch
from backend.services.pv_agents.rejection_audit import durable_rejection_audit_callback

class Connection:
    def __init__(self): self.calls=[]
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def execute(self,sql,params): self.calls.append((sql,params))

class AuditTests(unittest.TestCase):
    def test_parameterized_insert_and_no_source(self):
        connection=Connection()
        fake=types.SimpleNamespace(connect=lambda *a,**k:connection)
        event=dict(agent_id="AG08",expected_tenant="nexus-test-tenant",
                   expected_client="nexus-test-client",
                   event="specialist_execution_rejected",error_type="PermissionError")
        with patch.dict(sys.modules,{"psycopg":fake}):
            durable_rejection_audit_callback("postgresql://fake-local")(event)
        self.assertEqual(len(connection.calls),3)
        sql,params=connection.calls[-1]
        self.assertIn("INSERT INTO public.pv_agent_rejection_audit",sql)
        self.assertEqual(params[1],"AG08")
        self.assertNotIn("source_text",str(params))
    def test_unexpected_fields_and_untrusted_database_rejected(self):
        with self.assertRaises(ValueError):
            durable_rejection_audit_callback("sqlite:///tmp/db")
        record=dict(agent_id="AG08",expected_tenant="a",expected_client="b",
                    event="specialist_execution_rejected",error_type="PermissionError",
                    source_text="SYNTHETIC SOURCE MUST NEVER BE AUDITED")
        with self.assertRaises(ValueError):
            durable_rejection_audit_callback("postgresql://fake-local")(record)

if __name__=="__main__": unittest.main()
