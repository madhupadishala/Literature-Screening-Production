"""FastAPI surface. Contract mirrors /v1/agents/<name>/<verb> used by Seriousness agent."""
from fastapi import FastAPI
from .day_zero.agent import DayZeroAgent, DayZeroInput, DayZeroResult
from .reporter.agent import ReporterAgent, ReporterResult
from .patient.agent import PatientAgent, PatientResult
from .history.agent import HistoricalAgent
from .current.agent import CurrentAgent
from .common.medctx import MedCtxResult
from pydantic import BaseModel

class TextIn(BaseModel):
    text: str
    reaction_onset_date: str | None = None

def build(llm) -> FastAPI:   # llm injected: provider chosen by benchmark
    app = FastAPI(title="Nexus Agents v2")
    @app.post("/v1/agents/day-zero/identify", response_model=DayZeroResult)
    def dz(i: DayZeroInput): return DayZeroAgent(llm).run(i)
    @app.post("/v1/agents/reporter/extract", response_model=ReporterResult)
    def rep(i: TextIn): return ReporterAgent(llm).run(i.text)
    @app.post("/v1/agents/patient/extract", response_model=PatientResult)
    def pat(i: TextIn): return PatientAgent(llm).run(i.text)
    @app.post("/v1/agents/historical-conditions/extract", response_model=MedCtxResult)
    def his(i: TextIn): return HistoricalAgent(llm).run(i.text, i.reaction_onset_date)
    @app.post("/v1/agents/current-conditions-drugs/extract", response_model=MedCtxResult)
    def cur(i: TextIn): return CurrentAgent(llm).run(i.text, i.reaction_onset_date)
    return app
