import hashlib
import unittest
from types import SimpleNamespace
from backend.services.pv_agents.workflow_endpoint import assess_workflow
from backend.services.pv_agents.service import ServiceError
from backend.services.pv_agents.synthetic_composition import TEXT,DOC,KEY

class WorkflowEndpointTests(unittest.TestCase):
    def setUp(self):
        self.body={'tenantKey':'tenant-a','workspaceId':'workspace-a','environment':'UAT','documentId':DOC,'requestId':'SYN-request',
            'sourceSha256':hashlib.sha256(TEXT.encode()).hexdigest(),'text':TEXT,'sourceType':'SPONTANEOUS','receiptParty':'mah','receivedAt':'2026-10-01','sourceLanguage':'English',
            'approvedSource':{'patients':[],'reporters':[],'products':[],'events':[{'reported_term':'Nausea'}]}}
        self.scopes={'server-token':[{'tenant_id':'tenant-a','client_id':'workspace-a','workspace_id':'workspace-a','environment':'UAT','role':'workflow_runner'}]}
    def test_body_scope_and_environment_must_match_server_grants(self):
        for field in ('tenantKey','workspaceId','environment'):
            body={**self.body,field:'foreign'}
            with self.assertRaises(ServiceError) as cm:assess_workflow(body,'server-token',scopes=self.scopes)
            self.assertEqual(cm.exception.status,403)
    def test_diagnostic_identity_cannot_execute_patient_workflow(self):
        self.scopes['server-token'][0]['role']='staging_diagnostic_runner'
        with self.assertRaises(ServiceError) as cm:assess_workflow(self.body,'server-token',scopes=self.scopes)
        self.assertEqual(cm.exception.status,403)
    def test_wrong_source_hash_rejected(self):
        with self.assertRaises(ServiceError) as cm:assess_workflow({**self.body,'sourceSha256':'wrong'},'server-token',scopes=self.scopes)
        self.assertEqual(cm.exception.status,400)
