# ClinixAI Business Engines

Business engines contain pharmacovigilance decision logic.

They must not contain Streamlit UI code.

## Engine Responsibilities

- search_engine: literature source search and query execution
- screening_engine: article relevance and inclusion/exclusion logic
- validity_engine: ICSR validity checks
- seriousness_engine: seriousness and expedited reporting logic
- triage_engine: priority routing and workflow queue decisions
- deduplication_engine: duplicate detection
- submission_engine: downstream submission readiness and export preparation

## Rule

Pages call services.
Services call engines.
Engines return structured decisions.
