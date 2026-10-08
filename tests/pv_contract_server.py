"""Offline contract fixture; binds localhost only and is never deployed."""
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_specialist_workers import (
    PVAgentService, AuditStore, SeriousnessWorker, SeriousnessPipeline,
    OfflineBaselineExtractor, SAudit, SConfig, CausalityWorker, CausalityPipeline,
    UnknownExtractor, CAudit, CConfig, KnowledgeStore, ScopedRuntimeKnowledge,
    NexusDrugRoleAgent, NexusCausalityKnowledgeAdapter, KnowledgeRouter,
    HybridRetriever, EmptyCollection,
)
from wsgiref.simple_server import make_server

root = Path(sys.argv[1])
router = KnowledgeRouter(base_path=str(root), retriever=HybridRetriever(collection=EmptyCollection()))
drug = NexusDrugRoleAgent(router)
adapter = NexusCausalityKnowledgeAdapter(router)
workers = {
    'seriousness': SeriousnessWorker(SeriousnessPipeline(OfflineBaselineExtractor(), SAudit(str(root/'s.sqlite')), SConfig())),
    'causality': CausalityWorker(CausalityPipeline(UnknownExtractor(), CAudit(str(root/'c.sqlite')), CConfig(), KnowledgeStore(), nexus_client=ScopedRuntimeKnowledge(adapter)), drug),
}
app = PVAgentService({'contract-test-only': [{'tenant_id':'tenant','client_id':'client','workspace_id':'workspace'}]}, AuditStore(str(root/'audit.sqlite')), drug, workers, adapter)
os.environ['NEXUS_PV_AGENTS_ENABLED'] = 'true'
with make_server('127.0.0.1', 0, app) as server:
    print(f'PORT={server.server_port}', flush=True)
    server.serve_forever()
