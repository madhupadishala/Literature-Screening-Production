"""Current Conditions & Drugs Extractor -> D.7.1.r (continuing), D.7.3, concomitant G.k. knowledge/03_current.md
Final suspect/concomitant/interacting classification stays with Agent 1 (Drug Extraction & Classification);
this agent supplies `stated_role` + timing only."""
from __future__ import annotations
from ..common.base import LLMClient, sha
from ..common import medctx as m
class CurrentAgent:
    def __init__(self, llm: LLMClient): self.llm = llm
    def run(self, source: str, onset_override: str | None = None, _read: m.CtxRead | None = None) -> m.MedCtxResult:
        read = _read or m.extract(self.llm, source)
        conds, drugs, tx, flags, onset = m.partition(source, read, onset_override)
        cc = [i for i in conds if i.bucket is m.Bucket.current and i.payload["kind"] != "family_history"]
        cd = [i for i in drugs if i.bucket in (m.Bucket.current, m.Bucket.post_onset)]   # post_onset kept, flagged for Agent 1
        return m.MedCtxResult(agent="current_conditions_drugs", input_sha256=sha(source), reaction_onset_date=onset,
                              conditions=cc, drugs=cd, excluded_treatment_of_event=tx, flags=flags)

def run_both(llm: LLMClient, source: str, onset_override: str | None = None):
    """One LLM call, both views."""
    from ..history.agent import HistoricalAgent
    read = m.extract(llm, source)
    return (HistoricalAgent(llm).run(source, onset_override, read), CurrentAgent(llm).run(source, onset_override, read))
