"""Explicit recovered agent entry points. Does not activate production connections."""
from Agentic_AI.AG07_Laboratory_Data_Extraction.src.recovered_b2 import LabExtractionAgent
from Agentic_AI.AG16_AESI_Special_Situations.src.recovered_b2 import AesiSpecialSituationsAgent
from Agentic_AI.AG25_ICSR_Validity.src.recovered_b2 import IcsrValidityAgent
from Agentic_AI.AG27_Patient_Aggregate_Relevance.src.recovered_b2 import PatientAggregateRelevanceAgent
AGENTS = {"AG07": LabExtractionAgent,"AG16": AesiSpecialSituationsAgent,"AG25": IcsrValidityAgent,"AG27": PatientAggregateRelevanceAgent}
