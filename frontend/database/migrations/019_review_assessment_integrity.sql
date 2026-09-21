-- Sprint 5: operational Review / MR assessment integrity.

CREATE UNIQUE INDEX IF NOT EXISTS uq_label_assessment_case_product_event
  ON literature_label_assessments (
    tenant_id,
    review_workspace_id,
    patient_segment_key,
    lower(reported_product),
    lower(clinical_event)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_causality_assessment_case_product_event
  ON literature_causality_assessments (
    tenant_id,
    review_workspace_id,
    patient_segment_key,
    lower(reported_product),
    lower(clinical_event)
  );

CREATE INDEX IF NOT EXISTS idx_medical_reviews_workspace_status
  ON literature_medical_reviews (tenant_id, review_status, updated_at DESC);
