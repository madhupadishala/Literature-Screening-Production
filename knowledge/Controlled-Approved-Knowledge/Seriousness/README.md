# Seriousness knowledge — DRAFT

Shared recommendation implementation: `frontend/lib/pv-safety-assessment/seriousness-engine.ts`.

Mandatory rules are resolved by exact ID: SER-DEATH-001, SER-LIFE_THREATENING-001, SER-HOSPITALIZATION-001, SER-DISABILITY-001, SER-CONGENITAL_ANOMALY-001, SER-OTHER_MEDICALLY_IMPORTANT-001. These identifiers are proposed, not approved Knowledge Objects. All six require approved source-bound definitions before activation.

Source basis: ICH E2A section II.B and ICH E2D(R1) seriousness definitions; internal Literature Safety Surveillance SOP v0.1 section 19. Preserve death details independently of whether a particular event is fatal. Causality is separate from seriousness. Severity/CTCAE grade does not establish seriousness. Do not substitute keyword matches for medically important event judgment.

NLP sentence/context candidates retain full source offsets. Only attributed findings with exact valid source spans enter criterion arbitration. Span validation establishes quote integrity, not correctness of model interpretation. Missing evidence is UNRESOLVED. Conflicting positive findings retain a serious recommendation and require review. Reporter serious assessment is preserved.

Open gates: actual IME/CTCAE sources and licensing/version checks; approved per-client SOP and source binding; clinical NLP semantic validation and multilingual validation; reviewed real-world gold set; FAERS adapter validation; persisted audit/reviewer workflow; Literature/Intake/Case integration; release/governance and CodeRabbit clearance. This implementation is not production activated and publishes no accuracy claim.
