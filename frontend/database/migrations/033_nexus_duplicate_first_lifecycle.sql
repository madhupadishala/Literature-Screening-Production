-- Nexus lifecycle realignment: duplicate/follow-up review is an entry gate.
--
-- Migration 026 originally routed a valid ICSR to READY_FOR_DUPLICATE_REVIEW.
-- The governed Nexus operating model now performs duplicate/follow-up review
-- before formal ICSR triage. A completed valid triage therefore routes to QC.

ALTER TABLE safety_intake_records
  DROP CONSTRAINT IF EXISTS safety_intake_records_triage_outcome_check;

ALTER TABLE safety_triage_assessments
  DROP CONSTRAINT IF EXISTS safety_triage_assessments_triage_outcome_check;

UPDATE safety_intake_records
   SET triage_outcome = 'READY_FOR_QC'
 WHERE triage_outcome = 'READY_FOR_DUPLICATE_REVIEW';

UPDATE safety_triage_assessments
   SET triage_outcome = 'READY_FOR_QC'
 WHERE triage_outcome = 'READY_FOR_DUPLICATE_REVIEW';

ALTER TABLE safety_intake_records
  ADD CONSTRAINT safety_intake_records_triage_outcome_check
  CHECK (
    triage_outcome IS NULL OR triage_outcome IN (
      'READY_FOR_QC',
      'FOLLOW_UP_REQUIRED',
      'NOT_VALID_ICSR',
      'HOLD_FOR_CLARIFICATION'
    )
  );

ALTER TABLE safety_triage_assessments
  ADD CONSTRAINT safety_triage_assessments_triage_outcome_check
  CHECK (
    triage_outcome IN (
      'READY_FOR_QC',
      'FOLLOW_UP_REQUIRED',
      'NOT_VALID_ICSR',
      'HOLD_FOR_CLARIFICATION'
    )
  );
