import hashlib
import io
import json
import sqlite3
from datetime import date
from types import SimpleNamespace

import pytest

from backend.agents.drug_role import DrugRoleOrchestrator, Ownership, DrugRole
from backend.agents.drug_role.nexus_agent import NexusDrugRoleAgent
from backend.engines.causality.nexus_kb_adapter import NexusCausalityKnowledgeAdapter, CausalityKnowledgeRequest
from backend.knowledge.knowledge_router import KnowledgeRouter
from backend.knowledge.retriever import HybridRetriever
from backend.services.pv_agents.service import PVAgentService, AuditStore, ServiceError


def classify(text, candidates=None):
    return DrugRoleOrchestrator().classify(case_id='case',tenant_id='tenant',source_type='spontaneous',text=text,candidate_drugs=candidates)


def test_unknown_ownership_requires_review():
    r=classify('DrugX was suspected.', ['DrugX'])
    assert r.classifications[0].ownership==Ownership.UNKNOWN
    assert r.classifications[0].requires_human_review and r.review_required


def test_repeated_mention_offsets_match_exact_source():
    text='Prior history. DrugX was suspected and DrugX was withdrawn after the reaction.'
    r=classify(text,['DrugX'])
    for c in r.classifications:
        for e in c.evidence:
            assert text[e.start:e.end]==e.text
            assert e.end<=len(text)


def test_negation_offsets_are_source_text():
    text='Aspirin was not suspected.'
    r=classify(text)
    assert r.classifications[0].role==DrugRole.UNKNOWN
    for e in r.classifications[0].evidence:
        assert text[e.start:e.end]==e.text


def test_lowercase_aspirin_found_without_upstream_ner():
    assert classify('aspirin was suspected.').classifications[0].normalized_name=='aspirin'


def test_empty_extraction_requires_review():
    assert classify('No medicines were identified.').review_required


def test_invalid_scope_rejected():
    with pytest.raises(ValueError):
        DrugRoleOrchestrator().classify(case_id='c',tenant_id='',source_type='s',text='x')


class Collection:
    def query(self, **kwargs):
        self.kwargs=kwargs
        meta={'tenant_id':'tenant','client_id':'client','knowledge_type':'general_pv','agent_scope':'causality','country_scope':'IN','effective_date':'2025-01-01','version':'2'}
        return {'ids':[['ok','foreign','wrong_client','future','wrong_country','missing_date']], 'metadatas':[[meta,{**meta,'tenant_id':'other'},{**meta,'client_id':'other'},{**meta,'effective_date':'2027-01-01'},{**meta,'country_scope':'US'},{**meta,'effective_date':''}]],'documents':[['approved','bad','bad','bad','bad','bad']]}


def test_retrieval_prefilters_and_enforces_scope_dates():
    c=Collection();r=HybridRetriever(collection=c).retrieve_relevant_rules('q','causality','tenant',client_id='client',knowledge_types=('general_pv',),jurisdiction='IN',as_of=date(2026,1,1))
    assert [x['rule_id'] for x in r]==['ok']
    assert c.kwargs['where']=={'$and':[{'$or':[{'tenant_id':'GLOBAL'},{'$and':[{'tenant_id':'tenant'},{'client_id':{'$in':['client','GLOBAL']}}]}]}, {'knowledge_type': {'$in': ['general_pv']}}]}
    assert r[0]['version']=='2'


def test_wrong_knowledge_type_excluded():
    assert not HybridRetriever(collection=Collection()).retrieve_relevant_rules('q','causality','tenant',client_id='client',knowledge_types=('regulation',),jurisdiction='IN',as_of='2026-01-01')


def test_router_rejects_path_traversal(tmp_path):
    with pytest.raises(ValueError):
        KnowledgeRouter(str(tmp_path),retriever=HybridRetriever(collection=Collection())).build_context_pack('../escape','causality','task',{})


def test_product_master_is_client_scoped_and_empty_names_do_not_match(tmp_path):
    (tmp_path/'Products').mkdir();(tmp_path/'Products/tenant_product_master.json').write_text(json.dumps({'products':[{'trade_name':'Aspirin','client_id':'client'},{'trade_name':'Aspirin','client_id':'foreign'},{'trade_name':'','client_id':'client'}]}))
    pack=KnowledgeRouter(str(tmp_path),retriever=HybridRetriever(collection=Collection())).build_context_pack('tenant','causality','t',{'text':'Aspirin was taken.'},client_id='client')
    assert len(pack.product_master_matches)==1


class Router:
    def build_context_pack(self,**kwargs):
        self.kwargs=kwargs
        return SimpleNamespace(client_rules=[],general_rules=[],product_master_matches=[],citations=[])


def test_causality_forwards_all_requested_filters_and_miss_is_unknown():
    router=Router();req=CausalityKnowledgeRequest('tenant','client','q',('general_pv',),'IN',date(2026,1,1))
    out=NexusCausalityKnowledgeAdapter(router).retrieve(req)
    assert router.kwargs['client_id']=='client' and router.kwargs['knowledge_types']==req.knowledge_types
    assert router.kwargs['jurisdiction']=='IN' and router.kwargs['as_of']==req.as_of
    assert out.warnings==('retrieval_miss_unknown_not_negative',)


def test_causality_missing_client_rejected():
    with pytest.raises(ValueError):NexusCausalityKnowledgeAdapter(Router()).retrieve(CausalityKnowledgeRequest('tenant',None,'q',(),'IN',date.today()))


def test_clean_import_and_constructor_without_chroma_side_effects():
    NexusDrugRoleAgent();NexusCausalityKnowledgeAdapter()


class DrugAgent:
    def run(self,tenant_id,evidence_package,**kwargs):
        assert kwargs['client_id']=='client'
        return {'classifications':[],'review_required':True,'knowledge_context':{'version':'v2'}}


def request():
    narrative='aspirin was suspected.'
    return {'tenant_id':'tenant','client_id':'client','workspace_id':'workspace','request_id':'request','case_id':'case','narrative':narrative,'input_sha256':hashlib.sha256(narrative.encode()).hexdigest()}


def service(tmp_path):
    return PVAgentService({'test-token':[{'tenant_id':'tenant','client_id':'client','workspace_id':'workspace'}]},AuditStore(str(tmp_path/'audit.sqlite')),drug_agent=DrugAgent())


def test_service_records_durable_audit_before_returning(tmp_path):
    output=service(tmp_path).assess('drug-role',request(),'test-token')
    assert output['route']=='hitl' and output['review_required'] and output['audit_id']
    with sqlite3.connect(tmp_path/'audit.sqlite') as db:
        stored=json.loads(db.execute('SELECT output_json FROM pv_agent_audit').fetchone()[0])
    assert stored==output


def test_duplicate_request_conflicts(tmp_path):
    s=service(tmp_path);s.assess('drug-role',request(),'test-token')
    with pytest.raises(ServiceError) as e:s.assess('drug-role',request(),'test-token')
    assert e.value.status==409


@pytest.mark.parametrize('field,value',[('tenant_id','other'),('client_id','other'),('workspace_id','other')])
def test_service_rejects_foreign_scope(tmp_path,field,value):
    r=request();r[field]=value
    with pytest.raises(ServiceError) as e:service(tmp_path).assess('drug-role',r,'test-token')
    assert e.value.status==403


def test_service_rejects_reference_labels(tmp_path):
    r=request();r['faers_drugs']=[]
    with pytest.raises(ServiceError) as e:service(tmp_path).assess('drug-role',r,'test-token')
    assert e.value.status==400


def test_service_rejects_bad_hash(tmp_path):
    r=request();r['input_sha256']='0'*64
    with pytest.raises(ServiceError):service(tmp_path).assess('drug-role',r,'test-token')


def test_missing_external_decision_worker_is_unavailable(tmp_path):
    with pytest.raises(ServiceError) as e:service(tmp_path).assess('causality',request(),'test-token')
    assert e.value.status==503


def test_wsgi_authenticated_caller_and_disabled_gate(tmp_path,monkeypatch):
    s=service(tmp_path);body=json.dumps(request()).encode();env={'PATH_INFO':'/v1/agents/drug-role/assess','REQUEST_METHOD':'POST','CONTENT_LENGTH':str(len(body)),'HTTP_AUTHORIZATION':'Bearer test-token','wsgi.input':io.BytesIO(body)};statuses=[]
    result=s(env,lambda status,headers:statuses.append(status))
    assert statuses==['503 Service Unavailable']
    monkeypatch.setenv('NEXUS_PV_AGENTS_ENABLED','true');env['wsgi.input']=io.BytesIO(body);statuses.clear();result=s(env,lambda status,headers:statuses.append(status))
    assert statuses==['200 OK'] and json.loads(result[0])['audit_id']


def test_http_source_to_drug_engine_to_durable_audit(tmp_path, monkeypatch):
    import threading
    import urllib.request
    from wsgiref.simple_server import make_server, WSGIRequestHandler
    class Quiet(WSGIRequestHandler):
        def log_message(self, *args):
            pass
    class EmptyCollection:
        def query(self, **kwargs):
            return {'ids':[[]],'metadatas':[[]],'documents':[[]]}
    (tmp_path/'Products').mkdir()
    (tmp_path/'Products/tenant_product_master.json').write_text(json.dumps({'products':[{'trade_name':'aspirin','client_id':'client','effective_date':'2025-01-01'}]}))
    agent=NexusDrugRoleAgent(KnowledgeRouter(str(tmp_path),retriever=HybridRetriever(collection=EmptyCollection())))
    s=PVAgentService({'test-token':[{'tenant_id':'tenant','client_id':'client','workspace_id':'workspace'}]},AuditStore(str(tmp_path/'audit.sqlite')),drug_agent=agent)
    monkeypatch.setenv('NEXUS_PV_AGENTS_ENABLED','true')
    server=make_server('127.0.0.1',0,s,handler_class=Quiet)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}/v1/agents/drug-role/assess',data=json.dumps(request()).encode(),headers={'Authorization':'Bearer test-token','Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=5) as response:
            out=json.loads(response.read())
        item=out['result']['classifications'][0]
        assert item['role']=='SUSPECT' and item['ownership']=='COMPANY'
        assert out['route']=='hitl' and out['audit_id']
        with sqlite3.connect(tmp_path/'audit.sqlite') as db:
            assert db.execute('SELECT count(*) FROM pv_agent_audit').fetchone()[0]==1
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)


def test_combination_product_does_not_prove_single_ingredient_ownership():
    from backend.agents.drug_role.ownership import resolve_ownership
    assert resolve_ownership('Amoxicillin', [{'generic_name': 'Amoxicillin Clavulanate'}])[0] == Ownership.UNKNOWN


def test_longest_drug_mention_claims_overlapping_shorter_names():
    mentions = DrugRoleOrchestrator().extract_mentions('Amoxicillin Clavulanate was suspected. Amoxicillin was historical.', ['Amoxicillin Clavulanate', 'Amoxicillin'])
    assert [(m.reported_name, m.start) for m in mentions] == [('Amoxicillin Clavulanate', 0), ('Amoxicillin', 39)]


def test_indexer_quarantines_ownerless_client_rules(tmp_path):
    from backend.knowledge.vector_indexer import VectorIndexer
    folder = tmp_path / 'Clients' / 'tenant'; folder.mkdir(parents=True)
    (folder / 'unsafe.md').write_text('---\nrule_id: unsafe\n---\nA client rule without ownership.')
    (folder / 'safe.md').write_text('---\nrule_id: safe\nclient_id: client\nagent_scope: [causality]\ncountry_scope: [IN]\n---\nControlled client rule.')
    class Index:
        def delete(self, **kwargs): pass
        def upsert(self, **kwargs): self.data = kwargs
    indexer = VectorIndexer.__new__(VectorIndexer); indexer.base_path = str(tmp_path); indexer.collection = Index()
    report = indexer.rebuild_index('tenant')
    assert report == {'indexed': 1, 'skipped': [{'file': 'unsafe.md', 'missing': ['client_id', 'agent_scope', 'country_scope']}]}
    assert indexer.collection.data['ids'] == ['tenant:client:safe']


def test_shared_sentence_cue_does_not_assign_all_drugs_as_suspects():
    result = classify('Aspirin was suspected while metformin continued unchanged.')
    assert len(result.classifications) == 2
    assert all(c.role == DrugRole.UNKNOWN and c.requires_human_review for c in result.classifications)


def test_short_product_tokens_preserve_identity():
    from backend.agents.drug_role.ownership import resolve_ownership
    assert resolve_ownership('Vitamin B6',[{'generic_name':'Vitamin D3'}])[0]==Ownership.UNKNOWN
    assert resolve_ownership('Amlodipine',[{'generic_name':'Co-Amlodipine'}])[0]==Ownership.UNKNOWN


def test_reindex_removes_stale_scope_before_current_upsert(tmp_path):
    from backend.knowledge.vector_indexer import VectorIndexer
    class Collection:
        def __init__(self): self.calls=[]
        def delete(self,**kwargs):self.calls.append(kwargs)
    index=VectorIndexer.__new__(VectorIndexer);index.base_path=str(tmp_path);index.collection=Collection()
    assert index.rebuild_index('tenant')['indexed']==0
    assert index.collection.calls==[{'where':{'$and':[{'tenant_id':'tenant'},{'knowledge_type':'tenant_override'}]}},{'where':{'$and':[{'tenant_id':'GLOBAL'},{'knowledge_type':'general_pv'}]}}]


def test_migration_quarantines_invalid_expiry_and_indexes_nested_rules(tmp_path):
    from backend.validation.knowledge_migration import plan
    from backend.knowledge.vector_indexer import VectorIndexer
    rules=tmp_path/'Rules'/'nested';rules.mkdir(parents=True)
    base='---\nrule_id: nested\nversion: 1\neffective_date: 2020-01-01\nagent_scope: [GLOBAL]\ncountry_scope: [GLOBAL]\nsource_document: approved-rule\n'
    path=rules/'rule.md';path.write_text(base+'expiry_date: invalid\n---\nRule text')
    inventory=plan(tmp_path)
    assert inventory['quarantined']==1 and 'valid_expiry_date' in inventory['records'][0]['missing']
    path.write_text(base+'---\nRule text')
    assert plan(tmp_path)['eligible']==1
    class Collection:
        def delete(self,**kwargs):pass
        def upsert(self,**kwargs):self.rows=kwargs
    index=VectorIndexer.__new__(VectorIndexer);index.base_path=str(tmp_path);index.collection=Collection()
    assert index.rebuild_index('tenant')['indexed']==1
    assert index.collection.rows['ids']==['GLOBAL:nested']
