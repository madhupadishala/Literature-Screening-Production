import copy
import json
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from uuid import uuid4
from types import SimpleNamespace
from backend.services.pv_agents.document_workflow import DocumentWorkflow,VerifiedScope
from backend.services.pv_agents.synthetic_composition import synthetic_evidence,KEY,DOC
from Agentic_AI.shared.execution.dispatcher import AgentDispatcher

class ScopedIndex:
    def __init__(self):self.rows=[]
    def upsert(self,*,scope,document_id,text):
        self.rows.append({'id':document_id,'tenantKey':scope.tenant_key,'workspaceId':scope.workspace_id,'environment':scope.environment,'kind':'source'})
    def search(self,*,scope,query,limit):
        # Source text is NOT controlled knowledge: only scoped approved KB rows returned.
        return [r for r in self.rows if r.get('kind')=='approved' and r['tenantKey']==scope.tenant_key and r['workspaceId']==scope.workspace_id and r['environment']==scope.environment][:limit]

class SqliteSyntheticRepository:
    """Actual local SQL transaction fixture, not a production DB adapter."""
    def __init__(self,path):
        self.db=sqlite3.connect(path)
        self.db.execute('CREATE TABLE runs(tenant TEXT,workspace TEXT,environment TEXT,request TEXT,digest TEXT,output TEXT,PRIMARY KEY(tenant,workspace,environment,request))')
        self.db.execute('CREATE TABLE records(id TEXT,tenant TEXT,workspace TEXT,environment TEXT,kind TEXT,payload TEXT)')
        self.db.commit()
    @contextmanager
    def transaction(self,*,scope,request_id,source_sha256):
        db=self.db;key=(scope.tenant_key,scope.workspace_id,scope.environment,request_id)
        db.execute('BEGIN IMMEDIATE')
        class Tx:
            def existing(self):
                row=db.execute('SELECT digest,output FROM runs WHERE tenant=? AND workspace=? AND environment=? AND request=?',key).fetchone()
                if row and row[0]!=source_sha256:raise ValueError('Idempotency conflict')
                return json.loads(row[1]) if row else None
            def put(self,kind,details):
                id=str(uuid4());db.execute('INSERT INTO records VALUES (?,?,?,?,?,?)',(id,*key[:3],kind,json.dumps(details)));return id
            def audit(self,details):return self.put('audit',details)
            def intake(self,**details):return self.put('intake',details)
            def create_case_draft(self,**details):return self.put('case_draft',details)
            def enqueue_review(self,**details):return self.put('review',details)
            def stage_submission_preview(self,**details):return self.put('submission_preview',details)
            def complete(self,result):db.execute('INSERT INTO runs VALUES (?,?,?,?,?,?)',(*key,source_sha256,json.dumps(result)))
        try:yield Tx();db.commit()
        except Exception:db.rollback();raise

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.repo=SqliteSyntheticRepository(self.tmp.name+'/qa.sqlite');self.addCleanup(self.repo.db.close)
        self.index=ScopedIndex();self.scope=VerifiedScope('synthetic-tenant','synthetic-workspace','qa-runner','UAT')
        class Router:
            def build_context_pack(_,**k):return SimpleNamespace(tenant_id=k['tenant_id'],client_id=k['client_id'],citations=[])
        # Explicit mocked engine test: exercises real signed dispatcher and transaction workflow.
        self.dispatcher=AgentDispatcher(router=Router(),secret=KEY,specialists={f'AG{i:02d}':lambda e,p:{'synthetic_fixture':True} for i in range(1,28)})
        self.app=DocumentWorkflow(dispatcher=self.dispatcher,index=self.index,repository=self.repo,signing_secret=KEY)
    def run_doc(self,scope=None,evidence=None,request='synthetic-request'):
        return self.app.run(scope=scope or self.scope,document_id=DOC,request_id=request,evidence=evidence or synthetic_evidence())
    def test_document_to_draft_review_and_preview(self):
        output=self.run_doc();self.assertEqual(output['executed_slots'],27)
        self.assertEqual(output['status'],'PENDING_HUMAN_REVIEW')
        self.assertEqual(output['trace'][-1]['stage'],'submission_payload_staged')
        self.assertFalse(output['trace'][-1]['transmission_enabled'])
        self.assertEqual(len(output['trace']),32)
        self.assertEqual(self.run_doc(),output)
        print('SYNTHETIC_WORKFLOW_TRACE '+json.dumps(output,sort_keys=True))
    def test_workspace_and_tenant_isolate_knowledge_and_writes(self):
        for tenant,workspace in [('synthetic-tenant','synthetic-workspace'),('synthetic-tenant','alternate-workspace'),('other-tenant','synthetic-workspace')]:
            scope=VerifiedScope(tenant,workspace,'qa-runner','UAT')
            self.index.rows.append({'id':tenant+workspace,'tenantKey':tenant,'workspaceId':workspace,'environment':'UAT','kind':'approved'})
        first=self.run_doc()
        other=self.run_doc(scope=VerifiedScope('other-tenant','synthetic-workspace','qa-runner','UAT'))
        self.assertNotEqual(first['case_id'],other['case_id'])
        self.assertEqual(first['trace'][1]['citation_ids'],['synthetic-tenantsynthetic-workspace'])
        self.assertEqual(other['trace'][1]['citation_ids'],['other-tenantsynthetic-workspace'])
        self.assertEqual(self.repo.db.execute("SELECT count(*) FROM records WHERE tenant='synthetic-tenant' AND workspace='alternate-workspace'").fetchone()[0],0)
    def test_cross_scope_index_poisoning_rolls_back_case_and_audit(self):
        self.index.search=lambda **kwargs:[{'id':'foreign','tenantKey':'foreign','workspaceId':'foreign','environment':'UAT'}]
        with self.assertRaises(PermissionError):self.run_doc()
        self.assertEqual(self.repo.db.execute('SELECT count(*) FROM records').fetchone()[0],0)
    def test_body_cannot_choose_tenant(self):
        source=synthetic_evidence();source['workspaceId']='foreign'
        with self.assertRaises(PermissionError):self.run_doc(evidence=source)
    def test_changed_source_same_request_conflicts(self):
        self.run_doc();source=synthetic_evidence();source['text']+=' changed'
        with self.assertRaises(ValueError):self.run_doc(evidence=source)
