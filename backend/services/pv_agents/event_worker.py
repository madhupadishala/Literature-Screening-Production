"""Event proposals behind Nexus shared authorization, audit and knowledge boundaries."""
import asyncio
import base64
import hashlib
import json
import os
from datetime import date
from backend.agents.event_runtime.engine import EventEngine
from backend.agents.event_runtime.models import Request, Document
from backend.agents.event_runtime.providers import LangChainProvider
from backend.agents.event_runtime.ocr import LocalOCR

class EventWorker:
    def __init__(self, engine, knowledge_router):
        self.engine,self.router=engine,knowledge_router
    def __call__(self, request):
        documents=request.get('documents')
        if documents is None:
            source_type=request.get('source_type','unknown')
            if source_type not in ('spontaneous','literature','clinical_trial','regulatory','partner','organised_collection','digital','unknown'):
                source_type='unknown'
            documents=[Document(id='narrative',media_type='text/plain',language='und',source_type=source_type,
                                content_base64=base64.b64encode(request['narrative'].encode()).decode())]
        else:
            documents=[Document.model_validate(d) for d in documents]
        value=asyncio.run(self.engine.run(Request(case_id=request['case_id'],documents=documents)))
        result=value.model_dump(mode='json')
        citations=[]
        try:
            context=self.router.build_context_pack(tenant_id=request['tenant_id'],client_id=request['client_id'],
                agent_name='event_extraction',task='Retrieve controlled adverse-event extraction and coding references.',
                evidence_package={'case_id':request['case_id'],'evidence_package_id':request['request_id'],'text':request['narrative']},
                knowledge_types=('general_pv','tenant_override'),as_of=date.today())
            citations=context.citations
        except Exception:
            result['issues'].append('nexus_knowledge_retrieval_unavailable')
        if not citations:
            result['issues'].append('approved_event_knowledge_not_retrieved')
        snapshot=hashlib.sha256(json.dumps(citations,sort_keys=True).encode()).hexdigest()
        # Shared service checks narrative evidence. Document-specific spans remain in result.
        evidence=[]
        for event in value.events:
            for span in event.evidence:
                if span.document_id=='narrative':
                    origin=int(span.locator.rsplit('/chars:',1)[1].split('-')[0])
                    evidence.append({'text':span.quote,'start':origin+span.start,'end':origin+span.end})
        result.update(review_required=True,route='hitl',confidence=0.0,evidence_spans=evidence,
                      knowledge_version='unqualified-event-0.2.0:'+snapshot,knowledge_citations=citations)
        return result

def build_event_worker(router):
    provider=os.getenv('NEXUS_PV_PROVIDER') or os.getenv('AI_PROVIDER')
    model=os.getenv('AE_MODEL') or os.getenv('AI_MODEL')
    key=os.getenv('AE_LLM_API_KEY') or (os.getenv('GROQ_API_KEY') if provider=='groq' else None)
    if not model or not key:raise ValueError('Event model and credentials required')
    endpoint=os.getenv('AE_LLM_BASE_URL') or ('https://api.groq.com/openai/v1' if provider=='groq' else None)
    ocr=LocalOCR() if os.getenv('AE_OCR_ENABLED')=='true' else None
    schema_bundle = None
    if os.getenv('AE_XML_SCHEMA_DIR') and os.getenv('AE_XML_SCHEMA_MANIFEST'):
        from backend.agents.event_runtime.xml_validation import SchemaBundle
        schema_bundle = SchemaBundle(os.environ['AE_XML_SCHEMA_DIR'], os.environ['AE_XML_SCHEMA_MANIFEST'])
    return EventWorker(EventEngine(LangChainProvider(model,key,endpoint),ocr=ocr,schema_bundle=schema_bundle),router)
