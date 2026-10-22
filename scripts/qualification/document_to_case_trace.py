"""Genuine 27-engine synthetic workflow, persistent local Chroma and SQLite fixtures.

Provider/knowledge data are fixtures. SQL persistence is local QA, not Nexus production.
"""
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from backend.services.pv_agents.real_engine_qualification import components,evidence
from backend.services.pv_agents.synthetic_composition import KEY,DOC
from backend.services.pv_agents.document_workflow import DocumentWorkflow,VerifiedScope
from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.tests.test_document_workflow import SqliteSyntheticRepository

class LocalVectorIndex:
    def __init__(self,path):
        import chromadb
        from chromadb.config import Settings
        self.client=chromadb.PersistentClient(path=path,settings=Settings(anonymized_telemetry=False))
        self.collection=self.client.get_or_create_collection('synthetic_workflow_qa')
    def embed(self,text):
        digest=hashlib.sha256(text.encode()).digest()
        return [float(x)/255 for x in digest[:8]]
    def add(self,scope,id,text,kind):
        uid=hashlib.sha256(f'{scope.tenant_key}:{scope.workspace_id}:{scope.environment}:{id}'.encode()).hexdigest()
        self.collection.upsert(ids=[uid],embeddings=[self.embed(text)],documents=[text],metadatas=[{'id':id,'tenantKey':scope.tenant_key,'workspaceId':scope.workspace_id,'environment':scope.environment,'kind':kind}])
    def upsert(self,*,scope,document_id,text):self.add(scope,document_id,text,'source')
    def search(self,*,scope,query,limit):
        result=self.collection.query(query_embeddings=[self.embed(query)],n_results=limit,where={'$and':[
            {'tenantKey':scope.tenant_key},{'workspaceId':scope.workspace_id},{'environment':scope.environment},{'kind':'approved_fixture'}]},include=['metadatas','documents'])
        return [{**meta,'text':text} for meta,text in zip(result['metadatas'][0],result['documents'][0])]

def run():
    with tempfile.TemporaryDirectory() as tmp:
        scope=VerifiedScope('nexus-staging-tenant','nexus-staging-client','synthetic-qa-runner','UAT')
        other=VerifiedScope('nexus-staging-tenant','alternate-workspace','synthetic-qa-runner','UAT')
        foreign=VerifiedScope('other-tenant','nexus-staging-client','synthetic-qa-runner','UAT')
        index=LocalVectorIndex(tmp+'/chroma')
        for s in (scope,other,foreign):
            for kind in ('SOP','PRODUCT','LABEL'):
                index.add(s,s.tenant_key+'-'+s.workspace_id+'-'+kind,'SYNTHETIC '+kind+' QA only','approved_fixture')
        class Router:
            def build_context_pack(self,**kwargs):
                if (kwargs['tenant_id'],kwargs['client_id'])!=(scope.tenant_key,scope.workspace_id):raise PermissionError('Scope mismatch')
                rows=index.search(scope=scope,query=kwargs['evidence_package'].get('text',''),limit=10)
                return SimpleNamespace(tenant_id=scope.tenant_key,client_id=scope.workspace_id,citations=[{'rule_id':r['id'],'synthetic':True} for r in rows],
                    product_master_matches=[{'trade_name':'Metformin','client_id':scope.workspace_id}],approved_documents=[])
        dispatcher=build_dispatcher(signing_secret=KEY,router=Router(),**components())
        repo=SqliteSyntheticRepository(tmp+'/workflow.sqlite')
        try:
            result=DocumentWorkflow(dispatcher=dispatcher,index=index,repository=repo,signing_secret=KEY).run(
                scope=scope,document_id=DOC,request_id='SYN-REAL-WORKFLOW',evidence=evidence())
            for s in (scope,other,foreign):
                rows=index.search(scope=s,query='SOP PRODUCT LABEL',limit=10)
                assert len(rows)==3 and all(r['tenantKey']==s.tenant_key and r['workspaceId']==s.workspace_id for r in rows)
            result.update(repository_mode='local_sqlite_fixture',vector_mode='local_chroma_with_synthetic_embeddings',provider_mode='synthetic_fixtures',
                tenant_workspace_isolation_passed=True,production_data_used=False)
            print(json.dumps(result,indent=2))
        finally:repo.db.close()

if __name__=='__main__':run()
