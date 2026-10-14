"""AG27 — client-scoped, governed Nexus Knowledge Base adapter.

Source documents are authorized by Nexus before calling this adapter.
It never opens filesystem/demo knowledge or uses ungoverned retrieval.
"""
from Agentic_AI.shared.governed_knowledge_adapter import governed_context

AGENT_ID = "AG27"


def build_knowledge_context(execution, payload):
    """Return approved KB citations/excerpts and client Product Master context."""
    if execution.agent_id != AGENT_ID:
        raise ValueError("Knowledge adapter called for the wrong agent")
    return governed_context(execution, payload)
