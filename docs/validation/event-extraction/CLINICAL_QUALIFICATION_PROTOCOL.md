# Clinical production qualification protocol — draft, not approved

Qualification scope: event identification, patient attribution, source grounding, contextual classification and terminology proposals. Clinical seriousness, causality and listedness remain separate agents.

## Required execution inputs

- Approved service-host model/provider/version and credential available through its secret manager; no secrets in source or evidence.
- Source-document dataset with permitted use and original source hashes, divided by case/article lineage into development and blinded test sets.
- Two distinct identified PV reviewers, independent annotations and documented adjudication. Training documents and FDA mapping examples are not clinical gold labels.
- Reviewer-approved reference records containing case_id, patient_id, document_id, block_id, start and end, with role/assertion/coding tracked separately for clinical analysis.
- Pre-approved acceptance criteria and sample-size rationale. Thresholds must be agreed before results are inspected.
- Applicable licensed terminology version and controlled regulatory schema/business-rule bundle.

## Execution and evidence

1. Pin code, prompt, model, dictionary, schemas, source hashes and approved knowledge snapshots.
2. Run provider smoke test. Require only the expected nausea event for synthetic-source:P001; reject extra events and wrong-patient attribution.
3. Execute all blinded sources. Record every parser/OCR/provider failure and unresolved case; do not exclude failures to improve scores.
4. Match proposals to adjudicated labels. Measure patient/event recall and precision, wrong-patient assignments, missed events, unsupported events and source grounding separately. Exact-span scores are not coding or clinical-semantic accuracy.
5. Review OCR against page images, with specific checks for identifiers, negation, numbers and tables. Retain unresolved attachments as incomplete coverage.
6. Review medical coding and clinical-context discrepancies with PV experts. Retain disagreements and corrections in the audit record.
7. Run live Nexus Literature/Intake/Case Processing flows with authorized tenant/client/workspace boundaries and durable audit persistence.
8. Complete applicable FDA/EMA schema and business-rule checks, regression evidence and QA change control.
9. PV/QA owners decide disposition against approved acceptance criteria and sign release evidence. Model output, self-assessed accuracy and passed unit tests cannot grant clinical qualification.

## Current disposition

NOT QUALIFIED. Live model execution, adjudicated reference dataset, agreed acceptance criteria, regional validation and live production workflow evidence are outstanding. The PR remains a review candidate.
