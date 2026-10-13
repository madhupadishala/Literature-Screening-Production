"""Compatibility import for AG01; canonical implementation resides in Agentic_AI.

Existing Nexus callers can continue importing this module while the agent
implementation has a single authoritative home.
"""
from Agentic_AI.AG01_Drug_Extraction_Classification.src.backend.nexus_agent import NexusDrugRoleAgent

__all__ = ["NexusDrugRoleAgent"]
