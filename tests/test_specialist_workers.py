"""Recovered pipelines behind the real shared authorization and audit boundary."""
import hashlib
import sqlite3
from backend.services.pv_agents.service import PVAgentService, AuditStore
from backend.services.pv_agents.workers import SeriousnessWorker, CausalityWorker, ScopedRuntimeKnowledge
from backend.agents.seriousness_runtime.pipeline import SeriousnessPipeline
from backend.agents.seriousness_runtime.config import Config as SConfig
from backend.agents.seriousness_runtime.audit import AuditLog as SAudit
from backend.agents.seriousness_runtime.extraction import OfflineBaselineExtractor
from backend.agents.causality_runtime.pipeline import CausalityPipeline
from backend.agents.causality_runtime.config import Config as CConfig
from backend.agents.causality_runtime.audit import AuditLog as CAudit
from backend.agents.causality_runtime.kb import KnowledgeStore
from backend.agents.causality_runtime.schemas import PairExtraction, Factor, FactorValue
from backend.agents.drug_role.nexus_agent import NexusDrugRoleAgent
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.knowledge.retriever import HybridRetriever
from backend.engines.causality.nexus_kb_adapter import NexusCausalityKnowledgeAdapter

class EmptyCollection:
    def query(self, **kwargs): return {'ids': [[]]}
class UnknownExtractor:
    name = 'explicit-unknown-contract-fixture'
    def extract(self, narrative, drug, event, sample_index=0):
        return PairExtraction(factors=[FactorValue(factor=f, value='unknown') for f in Factor])

def test_specialists_execute_recovered_pipelines_and_commit_scoped_audit(tmp_path):
    router = KnowledgeRouter(base_path=str(tmp_path), retriever=HybridRetriever(collection=EmptyCollection()))
    drug = NexusDrugRoleAgent(router); adapter = NexusCausalityKnowledgeAdapter(router)
    workers = {
        'seriousness': SeriousnessWorker(SeriousnessPipeline(OfflineBaselineExtractor(), SAudit(str(tmp_path/'s.sqlite')), SConfig())),
        'causality': CausalityWorker(CausalityPipeline(UnknownExtractor(), CAudit(str(tmp_path/'c.sqlite')), CConfig(), KnowledgeStore(), nexus_client=ScopedRuntimeKnowledge(adapter)), drug),
    }
    app = PVAgentService({'secret':[{'tenant_id':'tenant','client_id':'client','workspace_id':'workspace'}]}, AuditStore(str(tmp_path/'audit.sqlite')), drug, workers, adapter)
    text = 'Aspirin was suspected. The patient was hospitalized for bleeding.'
    base = {'tenant_id':'tenant','client_id':'client','workspace_id':'workspace','case_id':'case','narrative':text,'source_type':'literature','event_terms':['bleeding'],'input_sha256':hashlib.sha256(text.encode()).hexdigest()}
    serious = app.assess('seriousness', {**base,'request_id':'s'}, 'secret')
    assert serious['decision']=='serious' and serious['criteria_met']==['hospitalization']
    assert serious['route']=='hitl' and serious['review_required'] and serious['execution_id']
    assert all(text[s['start']:s['end']]==s['text'] for s in serious['evidence_spans'])
    causal = app.assess('causality', {**base,'request_id':'c'}, 'secret')
    assert len(causal['result']['pairs'])==1
    assert causal['result']['pairs'][0]['drug'].lower()=='aspirin'
    assert causal['result']['pairs'][0]['label_listed']=='unknown'
    assert causal['route']=='hitl' and causal['review_required']
    with sqlite3.connect(tmp_path/'audit.sqlite') as db:
        assert db.execute('select count(*) from pv_agent_audit').fetchone()[0]==2


def test_silence_in_offline_seriousness_is_unknown():
    from backend.agents.seriousness_runtime.schemas import Criterion
    extraction = OfflineBaselineExtractor().extract('The patient reported an itchy rash.')
    assert all(f.status=='unknown' for f in extraction.findings if f.criterion==Criterion.DEATH)


def test_groq_mentions_are_strict_and_source_grounded():
    import json
    from types import SimpleNamespace
    from backend.services.pv_agents.groq_extraction import GroqExtractor
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'mentions':[{'name':'Aspirin','quote':'Aspirin was suspected.'}]})}}]}
    class Client:
        def post(self, url, **kwargs): self.payload=kwargs['json']; return Response()
    client=Client();extractor=GroqExtractor('drug-mentions','configured-model','test-key',client)
    assert extractor.extract_names('Aspirin was suspected.')==['Aspirin']
    assert client.payload['response_format']['json_schema']['strict'] is True
    import pytest
    with pytest.raises(ValueError):extractor.extract_names('Metformin was administered.')


def test_groq_truncated_extraction_is_rejected():
    from backend.services.pv_agents.groq_extraction import GroqExtractor
    import pytest
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'choices':[{'finish_reason':'length','message':{'content':'{}'}}]}
    class Client:
        def post(self,*args,**kwargs):return Response()
    with pytest.raises(ValueError):GroqExtractor('seriousness','configured-model','test-key',Client()).extract('source',0)


def test_audit_manifest_anchors_latest_row_not_lexicographic_max(tmp_path):
    log=CAudit(str(tmp_path/'manifest.sqlite'))
    for i in range(8):log.append({'test':i})
    manifest=log.export_manifest()
    assert manifest['last_hash']==log.db.execute('select hash from audit order by id desc limit 1').fetchone()[0]
    assert manifest['last_id']==8 and manifest['chain_valid']


def test_scoped_chunk_keys_do_not_collide():
    from backend.agents.causality_runtime.kb import Chunk
    from dataclasses import replace
    chunk=Chunk(kb='methodology',source='source',section_id='section',text='rule',version='1',tenant_scope='A',jurisdiction='IN')
    assert len({chunk.key,replace(chunk,tenant_scope='B').key,replace(chunk,jurisdiction='US').key})==3


def test_product_request_cannot_use_non_label_governed_chunks(tmp_path):
    import json
    from datetime import date
    from backend.agents.causality_runtime.nexus_kb import GovernedRepositoryKnowledgeAdapter,RetrievalRequest
    text='Aspirin bleeding appears in this SOP, which is not a product label.'
    row={'chunk_id':'sop','ko_id':'sop','title':'SOP','domain':'sop','version':'1','status':'Approved','section':'1','text':text,'content_hash_sha256':hashlib.sha256(text.encode()).hexdigest(),'effective_for_production':True,'tenant_id':'GLOBAL','client_id':'GLOBAL','jurisdiction':'GLOBAL','effective_date':'2020-01-01'}
    p=tmp_path/'chunks.jsonl';p.write_text(json.dumps(row)+'\n')
    adapter=GovernedRepositoryKnowledgeAdapter(p)
    result=adapter.retrieve(RetrievalRequest('tenant','client','Aspirin bleeding',('product','label','rsi'), 'IN', date.today(),product='Aspirin',event='bleeding'))
    assert not result.citations


def test_governed_retrieval_requires_explicit_current_scope():
    from datetime import date
    from backend.agents.causality_runtime.nexus_kb import GovernedRepositoryKnowledgeAdapter as Adapter, RetrievalRequest
    req=RetrievalRequest('tenant','client','query',('regulatory',),'IN',date(2026,1,1))
    row={'tenant_id':'tenant','client_id':'client','jurisdiction':'IN','effective_date':'2025-01-01'}
    assert Adapter._scope_ok(row,req)
    for change in ({'client_id':None},{'tenant_id':'other'},{'client_id':'other'},{'jurisdiction':'US'},{'effective_date':'2027-01-01'},{'expiry_date':'2025-12-31'},{'effective_date':'bad'}):
        assert not Adapter._scope_ok({**row,**change},req)
    assert not Adapter._scope_ok({},req)
    assert Adapter._scope_ok({**row,'tenant_id':'GLOBAL','client_id':'GLOBAL','jurisdiction':'GLOBAL'},req)


def test_multiple_audit_connections_share_one_chain(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    for kind in (SAudit,CAudit):
        path=str(tmp_path/(kind.__module__.split('.')[-2]+'.sqlite'))
        logs=[kind(path),kind(path)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda i:logs[i%2].append({'record':i}),range(60)))
        assert logs[0].verify()==(True,None)
        assert logs[0].db.execute('select count(*) from audit').fetchone()[0]==60
