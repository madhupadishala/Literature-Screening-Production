# Event extraction integration 0.2.0

Base source: 3d2e55d166d3f34ff8578e179b735cd4c2325dce.

Implemented:
- Shared worker `event-extraction` behind existing PVAgentService token scope and audit.
- Optional registration with NEXUS_PV_REGISTER_EVENT_EXTRACTION=true; existing agents and disabled-by-default release gate preserved.
- Event runtime with LangGraph/LangChain, exact evidence checks, original-language text, patient attribution, contextual observations and review routing.
- English Tesseract/Poppler PDF OCR with page references, confidence and bounding boxes. OCR character ambiguities are not silently corrected. Visual review remains necessary.
- E2B R2 reaction import and R3 OID-aware reaction import. FDA July 2024 official fixtures cover all 26 reaction records across 10 scenarios.
- Original XML evidence, source paths, reported coding version, null flavours and unknown coded values retained. Indication/lab fields are not conflated with reactions.
- Live-model smoke runner and separate blinded expert-reference evaluator.

Not completed:
- Live-model smoke run is blocked: AE_MODEL/AI_MODEL and approved model credentials are absent locally. Production secret values are not copied to this machine.
- Expert-labelled clinical benchmark is blocked: no adjudicated event-extraction reference dataset is available. FDA XML fixtures are software mapping examples, not clinical gold labels.
- Full FDA/EMA regional schema and business-rule qualification is pending. R3 reaction mapping tests do not establish regulatory submission validity; results remain incomplete for that gate.
- Production service deployment/configuration, actual Knowledge Base retrieval and Nexus end-user flow are pending. Repository integration and offline authorization/audit tests are complete.
- OCR tests cover a synthetic English scanned page; multilingual handwriting, complex tables and real CIOMS form layout accuracy are not qualified.

No clinical accuracy percentage, expert approval, production completion or autonomous-use approval is claimed.
