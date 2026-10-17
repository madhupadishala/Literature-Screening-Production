"""Offline actual-engine qualification with explicit synthetic model/knowledge fixtures.

Not a production provider composition. Does not enable clinical execution.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
from .synthetic_composition import KEY,DOC,TEXT,SyntheticJSONProvider,SyntheticRouter,SyntheticCandidates
from .native_qualification_runner import source
from Agentic_AI.shared.execution.factory import build_dispatcher
from Agentic_AI.shared.execution.native_event_engine import create_approved_event_runtime

class EventProviderFixture:
    identity='synthetic-fixture-no-model-call'
    async def extract(self, block):
        from importlib import import_module
        model=import_module('Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches.feat__event-extraction-agent.backend.agents.event_runtime.models')
        return model.Extraction(mentions=[],unresolved=[])
    async def verify(self, block, extracted):
        from importlib import import_module
        model=import_module('Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches.feat__event-extraction-agent.backend.agents.event_runtime.models')
        return model.Verification(findings=[],missed_evidence=[])

class NodeEngine:
    def execute(self,request):
        root=Path(__file__).resolve().parents[3]
        result=subprocess.run(['node','--import','tsx','scripts/qualification/run-synthetic-native.ts'],
            cwd=root/'frontend',input=json.dumps(request),text=True,capture_output=True,timeout=60,
            env={**os.environ,'NEXUS_SYNTHETIC_QUALIFICATION':'true'})
        if result.returncode:raise RuntimeError('Native TypeScript engine failed: '+result.stderr[-1000:])
        return json.loads(result.stdout)

def components():
    from Agentic_AI.AG11_Seriousness_Assessment.src.backend.pipeline import SeriousnessPipeline
    from Agentic_AI.AG11_Seriousness_Assessment.src.backend.extraction import OfflineBaselineExtractor as SExtractor
    from Agentic_AI.AG11_Seriousness_Assessment.src.backend.audit import AuditLog as SAudit
    from Agentic_AI.AG11_Seriousness_Assessment.src.backend.config import Config as SConfig
    from Agentic_AI.AG13_Causality_Assessment.src.backend.pipeline import CausalityPipeline
    from Agentic_AI.AG13_Causality_Assessment.src.backend.extraction import OfflineBaselineExtractor as CExtractor
    from Agentic_AI.AG13_Causality_Assessment.src.backend.audit import AuditLog as CAudit
    from Agentic_AI.AG13_Causality_Assessment.src.backend.config import Config as CConfig
    from Agentic_AI.AG13_Causality_Assessment.src.backend.kb import KnowledgeStore
    return dict(approved_llm=SyntheticJSONProvider(),duplicate_repository=SyntheticCandidates(),
        native_runtimes={'AG02':create_approved_event_runtime(provider=EventProviderFixture()),
            **{a:NodeEngine() for a in ('AG08','AG12','AG17','AG20','AG26')}},
        seriousness_pipeline=SeriousnessPipeline(SExtractor(),SAudit(),SConfig(samples=1)),
        causality_pipeline=CausalityPipeline(CExtractor(),CAudit(),CConfig(samples=1),KnowledgeStore()))

def evidence():
    from .synthetic_composition import synthetic_evidence
    out=synthetic_evidence()
    for agent,key in [('AG08','text'),('AG12','labeling_request'),('AG17','safety_request'),('AG20','narrative_request'),('AG26','triage_request')]:
        inp=source(agent)
        if isinstance(inp,dict):inp['document_id']=DOC
        if agent!='AG08':out[key]=inp
    out['seriousness_case']={'case_id':DOC,'narrative':TEXT,'event_terms':['Nausea']}
    out['causality_case']={'case_id':DOC,'client_id':'nexus-staging-client','narrative':TEXT,
        'drugs':[{'name':'Metformin'}],'events':[{'term':'Nausea'}]}
    out['event_request']={'document_id':DOC,'case':{'case_id':DOC,'documents':[{'id':'SYN-SOURCE','media_type':'text/plain','content_base64':base64.b64encode(TEXT.encode()).decode()}]}}
    return out

def run():
    from Agentic_AI.shared.workflow_context import issue_context
    dispatcher=build_dispatcher(signing_secret=KEY,router=SyntheticRouter(),**components())
    outcomes={}
    for agent in sorted(dispatcher.registry):
        envelope=issue_context(verified_principal='synthetic-runner',authorized_tenant='nexus-staging-tenant',
            authorized_client='nexus-staging-client',module_id='intake_triage' if agent in ('AG09','AG17','AG26') else 'case_processing',
            document_id=DOC,workflow_id='SYN-REAL-ENGINES',job_id='SYN-'+agent,agent_id=agent,task_type='synthetic_real_engine',signing_secret=KEY)
        try:
            result=dispatcher.execute(agent,envelope=envelope,evidence=evidence(),expected_tenant='nexus-staging-tenant',expected_client='nexus-staging-client')
            if result['result']['status']!='review_required':raise ValueError('Review bypass')
            outcomes[agent]={'status':'passed','native_engine_invoked':True,'provider_mode':'synthetic_fixture'}
        except Exception as exc:outcomes[agent]={'status':'failed','error_type':type(exc).__name__,'detail':str(exc)[:1000]}
    return {'synthetic_only':True,'clinical_release_authorized':False,'knowledge_retrieval_proven':False,
        'executed_specialists':sum(r['status']=='passed' for r in outcomes.values()),'total_slots':27,'outcomes':outcomes}

if __name__=='__main__':
    result=run();print(json.dumps(result,indent=2));raise SystemExit(0 if result['executed_specialists']==27 else 1)
