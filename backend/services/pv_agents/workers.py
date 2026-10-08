"""Adapters for the recovered specialist pipelines; all proposals require review.
An extractor must be supplied explicitly. Offline extractors are for contract testing only.
"""
import hashlib
import json
from datetime import date
from backend.agents.seriousness_runtime.pipeline import SeriousnessPipeline
from backend.agents.seriousness_runtime.schemas import CaseInput as SeriousnessCase
from backend.agents.causality_runtime.pipeline import CausalityPipeline
from backend.agents.causality_runtime.schemas import CaseInput as CausalityCase
from backend.agents.causality_runtime.nexus_kb import RetrievalResponse
from backend.engines.causality.nexus_kb_adapter import CausalityKnowledgeRequest


def spans(narrative, quotes):
    result = []
    for quote in quotes:
        if not quote: continue
        start = narrative.find(quote)
        if start >= 0 and not any(s['text'] == quote for s in result):
            result.append({'text': quote, 'start': start, 'end': start + len(quote)})
    return result


class SeriousnessWorker:
    def __init__(self, pipeline: SeriousnessPipeline): self.pipeline = pipeline
    def __call__(self, request):
        decision = self.pipeline.assess(SeriousnessCase(case_id=request['case_id'], narrative=request['narrative'], event_terms=request.get('event_terms', [])), request['tenant_id'])
        result = decision.model_dump(mode='json')
        evidence = spans(request['narrative'], [t.quote for t in decision.trace if t.met])
        if result['decision'] == 'serious' and not evidence:
            result['decision'] = 'needs_review'
            result['review_reasons'].append('seriousness_source_evidence_missing')
        result.update(route='hitl', review_required=True, confidence=0.0,
                      evidence_spans=evidence, knowledge_version='unqualified-seriousness-v0.9-recovered')
        result['review_reasons'] = sorted(set(result['review_reasons'] + ['clinical_qualification_pending']))
        return result


class ScopedRuntimeKnowledge:
    """Uses the Nexus authorization/date boundary. Product Master is never label evidence."""
    def __init__(self, adapter): self.adapter = adapter
    def retrieve(self, request):
        from backend.agents.causality_runtime.schemas import Citation
        # Label types remain a retrieval miss until a governed label adapter is configured.
        wanted = set(request.knowledge_types)
        types = tuple(x for x in ('general_pv', 'tenant_override') if x in wanted)
        if wanted.intersection({'regulatory', 'methodology', 'sop', 'governance'}):
            types = ('general_pv', 'tenant_override')
        if not types:
            return RetrievalResponse((), 'label-adapter-not-configured', 'nexus-scoped-v2', ('retrieval_miss_unknown_not_negative',))
        context = self.adapter.retrieve(CausalityKnowledgeRequest(tenant_id=request.tenant_id, client_id=request.client_id,
            query=request.query, knowledge_types=types, jurisdiction=request.jurisdiction.upper(), as_of=request.as_of))
        citations = tuple(Citation(kb='nexus', source=c.source, section_id=c.record_id, version=c.version or 'unqualified', quote=c.text[:500]) for c in context.citations if c.text)
        digest = hashlib.sha256(json.dumps([c.model_dump() for c in citations], sort_keys=True).encode()).hexdigest()
        return RetrievalResponse(citations, digest, context.retrieval_version, tuple(context.warnings))


class CausalityWorker:
    def __init__(self, pipeline: CausalityPipeline, drug_agent): self.pipeline, self.drug_agent = pipeline, drug_agent
    def __call__(self, request):
        classified = self.drug_agent.run(request['tenant_id'], {'case_id': request['case_id'], 'text': request['narrative'], 'source_type': request.get('source_type', 'other')}, client_id=request['client_id'])
        drugs = [{'name': d['normalized_name'], 'role': 'suspect'} for d in classified['classifications'] if d['role'] == 'SUSPECT']
        case = CausalityCase(case_id=request['case_id'], narrative=request['narrative'], drugs=drugs,
            events=[{'term': e} for e in request.get('event_terms', [])], client_id=request['client_id'], as_of=date.today(),
            source_type=request.get('source_type') if request.get('source_type') in ('spontaneous','literature','clinical_trial','social_media') else 'other')
        decision = self.pipeline.assess(case, request['tenant_id'])
        result = decision.model_dump(mode='json')
        quotes = [f.quote for pair in decision.pairs for f in pair.factors.values()]
        result.update(route='hitl', review_required=True, confidence=0.0, evidence_spans=spans(request['narrative'], quotes),
                      knowledge_version='unqualified-causality-v1.5-recovered')
        result['review_reasons'] = sorted(set(result['review_reasons'] + ['clinical_qualification_pending']))
        return result


def build_specialist_workers(drug_agent, adapter, audit_dir):
    """Explicit provider-backed registration. No automatic offline replacement."""
    import os
    from pathlib import Path
    from backend.agents.seriousness_runtime.extraction import AnthropicExtractor as SeriousnessExtractor
    from backend.agents.seriousness_runtime.config import Config as SeriousnessConfig
    from backend.agents.seriousness_runtime.audit import AuditLog as SeriousnessAudit
    from backend.agents.causality_runtime.extraction import AnthropicExtractor as CausalityExtractor
    from backend.agents.causality_runtime.config import Config as CausalityConfig
    from backend.agents.causality_runtime.audit import AuditLog as CausalityAudit
    from backend.agents.causality_runtime.kb import KnowledgeStore
    if not os.environ.get('ANTHROPIC_API_KEY'):
        raise ValueError('ANTHROPIC_API_KEY required for configured specialist extraction')
    root = Path(audit_dir); root.mkdir(parents=True, exist_ok=True)
    s_cfg = SeriousnessConfig(model=os.environ.get('SERIOUSNESS_MODEL', ''))
    c_cfg = CausalityConfig(model=os.environ.get('CAUSALITY_MODEL', ''))
    seriousness = SeriousnessPipeline(SeriousnessExtractor(s_cfg.model), SeriousnessAudit(str(root / 'seriousness.sqlite')), s_cfg)
    causality = CausalityPipeline(CausalityExtractor(c_cfg.model), CausalityAudit(str(root / 'causality.sqlite')), c_cfg,
                                 KnowledgeStore(), nexus_client=ScopedRuntimeKnowledge(adapter))
    return {'seriousness': SeriousnessWorker(seriousness), 'causality': CausalityWorker(causality, drug_agent)}
