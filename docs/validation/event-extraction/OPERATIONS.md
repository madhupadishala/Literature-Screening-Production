# Operations and qualification

Install requirements-agents.txt plus Tesseract English and Poppler system packages.
Set NEXUS_PV_AGENTS_ENABLED=true only in the controlled review environment.
Register with NEXUS_PV_REGISTER_EVENT_EXTRACTION=true and an approved AE_MODEL/AI_MODEL,
AE_LLM_API_KEY or Groq configuration (NEXUS_PV_PROVIDER=groq, GROQ_API_KEY), and optionally AE_OCR_ENABLED=true.
Reuse existing NEXUS_PV_SERVICE_TOKEN_SCOPES and NEXUS_PV_AUDIT_DB. Keep credentials server-side.

POST /v1/agents/event-extraction/assess to the shared service using the same scope-bound contract as other PV agents:
tenant_id, client_id, workspace_id, request_id, case_id, narrative, input_sha256.
Optional documents accepts runtime Document objects (base64 source bytes, document ID, media type and source type).
Document output hashes are retained independently of the narrative checksum.
The existing shared HTTP 2MB request limit still applies. Larger sources require an approved object-store ingestion job.
Original document spans stay inside the nested result. Top-level evidence spans describe only the narrative.
Do not derive seriousness, causality or listedness from an unreviewed event proposal.

Run live smoke: `python -m backend.agents.event_runtime.live_validation`.
Run blinded scoring: `python -m backend.agents.event_runtime.qualification reference.json predictions.json`.
Reference metadata: dataset_kind=expert_adjudicated, split=blinded_test, reviewer_ids (at least two), adjudication_complete=true, dataset_sha256, labels.
Prediction metadata: source=live_model, model, dataset_sha256, labels.
Each label: case_id, patient_id, document_id, block_id, start, end. Offsets are block-relative; patient IDs use document scope.
Experts must review source completeness, missing events, wrong-patient assignments and coding accuracy separately.
Successful scoring does not grant clinical release approval.
