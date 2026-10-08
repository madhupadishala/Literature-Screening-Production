"""Synthetic live-model smoke test. Never represented as clinical qualification."""
import asyncio
import base64
import json
import os
from pathlib import Path
from .models import Request, Document
from .providers import LangChainProvider
from .engine import EventEngine

async def validate():
    key=os.getenv('AE_LLM_API_KEY') or os.getenv('GROQ_API_KEY')
    model=os.getenv('AE_MODEL') or os.getenv('AI_MODEL')
    if not key or not model:
        return {'status':'blocked','missing':[k for k,v in [('model',model),('model_credentials',key)] if not v],
                'clinical_qualification':False}
    url=os.getenv('AE_LLM_BASE_URL')
    if not url and os.getenv('GROQ_API_KEY') and not os.getenv('AE_LLM_API_KEY'):
        url='https://api.groq.com/openai/v1'
    text='Patient P001 developed nausea after taking medicine. No rash was reported. Diabetes was the indication for treatment.'
    provider=LangChainProvider(model,key,url)
    result=await EventEngine(provider).run(Request(case_id='synthetic-smoke-test',documents=[Document(
        id='synthetic-source',media_type='text/plain',language='en',content_base64=base64.b64encode(text.encode()).decode())]))
    terms=[e.verbatim.casefold() for e in result.events]
    passed='nausea' in terms and 'rash' not in terms and 'diabetes' not in terms and result.status!='incomplete'
    return {'status':'passed' if passed else 'failed','model':model,'run':result.model_dump(),
            'clinical_qualification':False,'test_type':'synthetic_live_model_smoke'}

if __name__=='__main__':
    import sys
    output=asyncio.run(validate())
    Path('live-validation.json').write_text(json.dumps(output,indent=2))
    print(json.dumps({k:v for k,v in output.items() if k!='run'},indent=2))
    sys.exit(0 if output['status']=='passed' else 3)
