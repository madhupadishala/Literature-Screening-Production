CREATE TABLE IF NOT EXISTS screening_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES literature_packages(id) ON DELETE CASCADE,
  screening_result_id uuid NOT NULL REFERENCES screening_results(id) ON DELETE CASCADE,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'excluded', 'flagged')),
  final_decision text NOT NULL
    CHECK (final_decision IN ('INCLUDE', 'EXCLUDE', 'REVIEW')),
  comments text,
  reviewed_by uuid REFERENCES application_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_version integer NOT NULL DEFAULT 1 CHECK (review_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, package_id, screening_result_id)
);

CREATE INDEX IF NOT EXISTS idx_screening_reviews_tenant_status
  ON screening_reviews (tenant_id, review_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_screening_reviews_package
  ON screening_reviews (tenant_id, package_id, screening_result_id);
