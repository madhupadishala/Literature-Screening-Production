"""Fail-closed production composition for all 27 genuine engines.

Only server-owned configuration and approved dependencies. No test provider import.
"""
import json
import os
from importlib import import_module
from Agentic_AI.shared.execution.approved_json_provider import PrivateStructuredJSONClient
from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.execution.native_event_engine import create_approved_event_runtime
from Agentic_AI.shared.execution.node_socket_runtime import probe_native_ready

class StructuredExtractor:
    name='approved-private-json'
    def __init__(self,agent,provider): self.agent,self.provider=agent,provider
    def extract(self,narrative,*args,**kwargs):
        ns='Agentic_AI.'+('AG11_Seriousness_Assessment' if self.agent=='AG11' else 'AG13_Causality_Assessment')+'.src.backend'
        extraction=import_module(ns+'.extraction');schemas=import_module(ns+'.schemas')
        model=schemas.Extraction if self.agent=='AG11' else schemas.PairExtraction
        user=json.dumps({'narrative':narrative,'drug':args[0] if args else None,'event':args[1] if len(args)>1 else None})
        return model.model_validate(self.provider.complete_json(system=extraction.SYSTEM,user=user,schema=model.model_json_schema()))

class ScopedDuplicateRepository:
    def __init__(self,database_url,environment):
        if environment not in ("PROD","UAT","TRAINING"):raise ValueError("Environment required")
        self.url,self.environment=database_url,environment
    def list_candidates(self,*,kind,tenant_id,client_id,limit):
        import psycopg
        # Dedicated SQL view projects normalized comparison records, and includes
        # tenant key/workspace/environment in every row. Never accept caller corpora.
        with psycopg.connect(self.url,connect_timeout=5) as db:
            rows=db.execute('SELECT record_id,record FROM nexus_agent_duplicate_candidates WHERE tenant_key=%s AND workspace_id::text=%s AND environment=%s AND kind=%s LIMIT %s',
                (tenant_id,client_id,self.environment,kind,limit)).fetchall()
        return [{'record_id':str(id),'record':record,'tenant_id':tenant_id,'client_id':client_id} for id,record in rows]

def build_workflow_dispatcher(*,secret,router,environment):
    provider=PrivateStructuredJSONClient.from_server_env()
    sock=os.environ['NEXUS_NATIVE_SOCKET_PATH']
    if not probe_native_ready(socket_path=sock,signing_secret=secret): raise RuntimeError('Native worker unavailable')
    from .native_local_event_provider import create_local_event_provider
    S='Agentic_AI.AG11_Seriousness_Assessment.src.backend'
    C='Agentic_AI.AG13_Causality_Assessment.src.backend'
    seriousness=import_module(S+'.pipeline').SeriousnessPipeline(StructuredExtractor('AG11',provider),import_module(S+'.audit').AuditLog(),import_module(S+'.config').Config(auto_enabled=False))
    causality=import_module(C+'.pipeline').CausalityPipeline(StructuredExtractor('AG13',provider),import_module(C+'.audit').AuditLog(),import_module(C+'.config').Config(auto_enabled=False),import_module(C+'.kb').KnowledgeStore())
    return build_dispatcher(signing_secret=secret,router=router,approved_llm=provider,
        duplicate_repository=ScopedDuplicateRepository(os.environ['NEXUS_WORKFLOW_DATABASE_URL'],environment),
        native_socket_path=sock,native_ts_agents=('AG08','AG12','AG17','AG20','AG26'),
        ag02_runtime=create_approved_event_runtime(provider=create_local_event_provider()),
        seriousness_pipeline=seriousness,causality_pipeline=causality)
