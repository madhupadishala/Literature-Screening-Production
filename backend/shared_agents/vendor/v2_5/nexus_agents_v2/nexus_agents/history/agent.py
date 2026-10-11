"""Historical Conditions Extractor -> D.7.1.r (ended), D.7.1.r.6 family history, D.8.r past drug history. knowledge/02_historical.md"""
from __future__ import annotations
from ..common.base import LLMClient, sha
from ..common import medctx as m
class HistoricalAgent:
    def __init__(self, llm: LLMClient): self.llm = llm
    def run(self, source: str, onset_override: str | None = None, _read: m.CtxRead | None = None) -> m.MedCtxResult:
        read = _read or m.extract(self.llm, source)
        conds, drugs, tx, flags, onset = m.partition(source, read, onset_override)
        keep = (m.Bucket.historical, m.Bucket.unclassified)   # unclassified surfaces for human review, not dropped
        # family history is always historical context regardless of timing wording
        hc = [i for i in conds if i.bucket in keep or i.payload["kind"] == "family_history"]
        hd = [i for i in drugs if i.bucket in keep]
        return m.MedCtxResult(agent="historical_conditions", input_sha256=sha(source), reaction_onset_date=onset,
                              conditions=hc, drugs=hd, flags=flags)
