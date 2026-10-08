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
