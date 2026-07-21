export type HitsReviewStatus =
  | "pending"
  | "approved"
  | "dismissed"
  | "flagged";

export type HitsReviewDecision =
  | "pending"
  | "accept_ai"
  | "reject_hit"
  | "needs_second_review";

export interface HitsWorklistRecord {
  hit_id: string;
  hits_result_id: string;
  database_package_id: string;
  package_id: string;
  result_version: number;
  pmid: string;
  doi?: string;
  title: string;
  journal: string;
  publication_date: string;
  product_name: string;
  normalized_identity: string;
  matched_term: string;
  match_type: string;
  match_source: string;
  company_product_status: string;
  author_country: string;
  country_of_interest: string;
  mah_country_match: boolean;
  pii_present: boolean;
  confidence_score: number;
  qc_required: boolean;
  duplicate_detected: boolean;
  duplicate_source_count: number;
  duplicate_confidence: number;
  duplicate_signals: string[];
  evidence_sentence: string;
  ai_summary: string;
  review_status: HitsReviewStatus;
  review_decision: HitsReviewDecision;
  review_comments?: string;
  review_version: number;
  reviewed_at?: string;
  reviewed_by?: string;
  workflow_state: string;
}

export interface SaveHitsReviewInput {
  packageId: string;
  hitsResultId: string;
  status: HitsReviewStatus;
  comments?: string;
  expectedVersion?: number;
}

export interface SavedHitsReview {
  id: string;
  packageId: string;
  hitsResultId: string;
  status: HitsReviewStatus;
  decision: HitsReviewDecision;
  comments?: string;
  reviewVersion: number;
  reviewedAt?: string;
  reviewedBy?: string;
  workflowState: "HITS_COMPLETE" | "HITS_REVIEW";
}
