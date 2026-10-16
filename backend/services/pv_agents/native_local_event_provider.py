"""Staging-only approved AG02 provider: local OpenAI-compatible Ollama API."""
import os
from importlib import import_module
from urllib.parse import urlparse

def create_local_event_provider():
    url=os.environ.get("NEXUS_AG02_LOCAL_PROVIDER_URL","http://ollama:11434/v1")
    model=os.environ.get("NEXUS_AG02_LOCAL_MODEL")
    parsed=urlparse(url)
    if (not model or parsed.scheme!="http" or
        parsed.hostname not in ("ollama","localhost","127.0.0.1") or
        parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise RuntimeError("AG02 approved colocated model is required")
    namespace=("Agentic_AI.AG02_Adverse_Event_MedDRA.src.branches."
               "feat__event-extraction-agent.backend.agents.event_runtime")
    provider_type=import_module(namespace+".providers").LangChainProvider
    # Ollama-compatible key is a local placeholder, never a remote token.
    return provider_type(model=model,api_key="local-staging-only",base_url=url)
