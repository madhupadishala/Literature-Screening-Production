"""
ClinixAI Product Detection Service.

This package detects medicinal product mentions from local article evidence.
It does not decide suspect, causality, treatment, or concomitant status.
"""

from .product_service import ProductDetectionService, ProductFact
from .evidence_extractor import EvidenceExtractor

__all__ = [
    "ProductDetectionService",
    "ProductFact",
    "EvidenceExtractor",
]