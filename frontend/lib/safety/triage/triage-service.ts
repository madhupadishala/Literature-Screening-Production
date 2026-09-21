import "server-only";

import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { evaluateTriageSnapshot } from "./triage-evaluator";
import {
  SERIOUSNESS_CRITERIA,
  SPECIAL_SITUATIONS,
  type FinalTriageDecision,
  type MinimumCriterionAssessment,
  type MinimumCriterionKey,
  type SeriousnessCriterion,
  type SpecialSituation,
  type TriageOutcome,
  type TriageSystemSnapshot,
} from "./triage-types";

const REQUIRED_CRITERIA: readonly MinimumCriterionKey[] = [
  "IDENTIFIABLE_PATIENT",
  "IDENTIFIABLE_REPORTER",
  "SUSPECT_PRODUCT",
  "ADVERSE_EVENT",
];

export interface TriageAssessmentRecord {
  id: string;
  assessmentVersion: number;
  systemSnapshot: TriageSystemSnapshot;
  minimumCriteria: MinimumCriterionAssessment[];
  humanValidityDecision: "VALID" | "INVALID" | "UNRESOLVED";
  seriousnessStatus: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  seriousnessCriteria: Partial<Record<SeriousnessCriterion, boolean>>;
  specialSituations: SpecialSituation[];
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  followUpRequired: boolean;
  followUpReasons: string[];
  triageOutcome: TriageOutcome;
  rationale: string;
  assessedAt: string;
}

export interface TriageWorkspace {
  systemSnapshot: TriageSystemSnapshot;
  latestAssessment: TriageAssessmentRecord | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

async function loadIntakeForTriage(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  forUpdate = false,
) {
  const intake = await client.query<Record<string, unknown>>(
    `SELECT intake.*, source.source_payload
       FROM safety_intake_records intake
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = intake.tenant_id
      WHERE intake.tenant_id = $1
        AND intake.id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE OF intake" : ""}`,
    [tenantId, intakeRecordId],
  );
  if (!intake.rows[0]) {
    throw new Error("Safety Intake was not found in the active tenant.");
  }
  return intake.rows[0];
}

async function buildSystemSnapshot(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  intake?: Record<string, unknown>,
): Promise<TriageSystemSnapshot> {
  const intakeRow =
    intake ?? (await loadIntakeForTriage(client, tenantId, intakeRecordId));

  const [patients, reporters, products, events] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_patients
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_reporters
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY primary_source DESC, created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_products
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_events
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
  ]);

  return evaluateTriageSnapshot({
    patients: patients.rows,
    reporters: reporters.rows,
    products: products.rows,
    events: events.rows,
    sourcePayload: object(intakeRow.source_payload),
    intakePayload: object(intakeRow.intake_payload),
  });
}

function validateHumanCriteria(
  criteria: MinimumCriterionAssessment[],
): MinimumCriterionAssessment[] {
  if (!Array.isArray(criteria) || criteria.length !== REQUIRED_CRITERIA.length) {
    throw new Error("Exactly four minimum ICSR criteria are required.");
  }

  const seen = new Set<string>();
  for (const item of criteria) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each minimum ICSR criterion must be an object.");
    }
    if (!REQUIRED_CRITERIA.includes(item.key)) {
      throw new Error(`Unsupported minimum criterion: ${String(item.key)}.`);
    }
    if (seen.has(item.key)) {
      throw new Error(`Duplicate minimum criterion: ${item.key}.`);
    }
    seen.add(item.key);

    if (!["MET", "MISSING", "UNRESOLVED"].includes(item.status)) {
      throw new Error(`Invalid status for criterion ${item.key}.`);
    }
    if (!item.reason?.trim()) {
      throw new Error(`A human reason is required for criterion ${item.key}.`);
    }
  }

  for (const key of REQUIRED_CRITERIA) {
    if (!seen.has(key)) {
      throw new Error(`Missing minimum criterion: ${key}.`);
    }
  }

  return criteria.map((item) => ({
    ...item,
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map(String).filter(Boolean)
      : [],
    reason: item.reason.trim(),
  }));
}

function validateDecision(
  decision: FinalTriageDecision,
): {
  decision: FinalTriageDecision;
  outcome: TriageOutcome;
} {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new Error("A triage decision object is required.");
  }
  if (!["VALID", "INVALID", "UNRESOLVED"].includes(decision.humanValidityDecision)) {
    throw new Error("A valid humanValidityDecision is required.");
  }
  if (
    !["SERIOUS", "NON_SERIOUS", "UNRESOLVED"].includes(
      decision.seriousnessStatus,
    )
  ) {
    throw new Error("A valid seriousnessStatus is required.");
  }
  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(decision.priority)) {
    throw new Error("A valid triage priority is required.");
  }
  if (typeof decision.followUpRequired !== "boolean") {
    throw new Error("followUpRequired must be boolean.");
  }

  const minimumCriteria = validateHumanCriteria(decision.minimumCriteria);
  const allMet = minimumCriteria.every((item) => item.status === "MET");
  const anyMissing = minimumCriteria.some((item) => item.status === "MISSING");
  const anyOpen = minimumCriteria.some((item) => item.status !== "MET");

  if (decision.humanValidityDecision === "VALID" && !allMet) {
    throw new Error(
      "A VALID ICSR requires all four human-confirmed minimum criteria to be MET.",
    );
  }
  if (decision.humanValidityDecision === "INVALID" && !anyMissing) {
    throw new Error(
      "An INVALID decision requires at least one minimum criterion to be MISSING.",
    );
  }
  if (decision.humanValidityDecision === "UNRESOLVED" && !anyOpen) {
    throw new Error(
      "An UNRESOLVED decision requires at least one criterion to remain MISSING or UNRESOLVED.",
    );
  }

  const seriousnessCriteria = Object.fromEntries(
    SERIOUSNESS_CRITERIA.map((key) => [
      key,
      decision.seriousnessCriteria?.[key] === true,
    ]),
  ) as Record<SeriousnessCriterion, boolean>;
  const hasSeriousCriterion = Object.values(seriousnessCriteria).some(Boolean);

  if (decision.seriousnessStatus === "SERIOUS" && !hasSeriousCriterion) {
    throw new Error(
      "A SERIOUS assessment requires at least one seriousness criterion.",
    );
  }
  if (decision.seriousnessStatus === "NON_SERIOUS" && hasSeriousCriterion) {
    throw new Error(
      "A NON_SERIOUS assessment cannot contain a positive seriousness criterion.",
    );
  }

  if (!Array.isArray(decision.specialSituations)) {
    throw new Error("specialSituations must be an array.");
  }
  if (!Array.isArray(decision.followUpReasons)) {
    throw new Error("followUpReasons must be an array.");
  }

  const specialSituations = Array.from(
    new Set(
      decision.specialSituations.filter(
        (item): item is SpecialSituation =>
          typeof item === "string" &&
          (SPECIAL_SITUATIONS as readonly string[]).includes(item),
      ),
    ),
  );

  const followUpReasons = Array.from(
    new Set(
      decision.followUpReasons
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length >= 3),
    ),
  );

  if (decision.followUpRequired && followUpReasons.length === 0) {
    throw new Error(
      "At least one follow-up reason is required when follow-up is required.",
    );
  }
  if (!decision.followUpRequired && decision.humanValidityDecision === "UNRESOLVED") {
    throw new Error(
      "An unresolved ICSR validity decision requires follow-up or clarification.",
    );
  }

  if (typeof decision.rationale !== "string") {
    throw new Error("Triage rationale is required.");
  }
  const rationale = decision.rationale.trim();
  if (rationale.length < 10) {
    throw new Error("Triage rationale must contain at least 10 characters.");
  }

  let outcome: TriageOutcome;
  if (decision.humanValidityDecision === "VALID") {
    outcome = "READY_FOR_DUPLICATE_REVIEW";
  } else if (decision.humanValidityDecision === "INVALID") {
    outcome = "NOT_VALID_ICSR";
  } else if (decision.followUpRequired) {
    outcome = "FOLLOW_UP_REQUIRED";
  } else {
    outcome = "HOLD_FOR_CLARIFICATION";
  }

  return {
    outcome,
    decision: {
      ...decision,
      minimumCriteria,
      seriousnessCriteria,
      specialSituations,
      followUpReasons,
      rationale,
    },
  };
}

function mapAssessment(row: Record<string, unknown>): TriageAssessmentRecord {
  return {
    id: String(row.id),
    assessmentVersion: Number(row.assessment_version),
    systemSnapshot: object(row.system_snapshot) as unknown as TriageSystemSnapshot,
    minimumCriteria: arrayOfRecords(
      row.human_minimum_criteria,
    ) as unknown as MinimumCriterionAssessment[],
    humanValidityDecision: String(
      row.human_validity_decision,
    ) as TriageAssessmentRecord["humanValidityDecision"],
    seriousnessStatus: String(
      row.seriousness_status,
    ) as TriageAssessmentRecord["seriousnessStatus"],
    seriousnessCriteria: object(
      row.seriousness_criteria,
    ) as Partial<Record<SeriousnessCriterion, boolean>>,
    specialSituations: Array.isArray(row.special_situations)
      ? (row.special_situations.map(String) as SpecialSituation[])
      : [],
    priority: String(row.priority) as TriageAssessmentRecord["priority"],
    followUpRequired: row.follow_up_required === true,
    followUpReasons: Array.isArray(row.follow_up_reasons)
      ? row.follow_up_reasons.map(String)
      : [],
    triageOutcome: String(row.triage_outcome) as TriageOutcome,
    rationale: String(row.rationale),
    assessedAt: new Date(String(row.assessed_at)).toISOString(),
  };
}

export async function getTriageWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<TriageWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const client = await getPostgresPool().connect();
  try {
    const intake = await loadIntakeForTriage(
      client,
      input.principal.tenantId,
      intakeRecordId,
    );
    const systemSnapshot = await buildSystemSnapshot(
      client,
      input.principal.tenantId,
      intakeRecordId,
      intake,
    );
    const latest = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_triage_assessments
        WHERE tenant_id = $1
          AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    );

    return {
      systemSnapshot,
      latestAssessment: latest.rows[0] ? mapAssessment(latest.rows[0]) : null,
    };
  } finally {
    client.release();
  }
}

export async function finalizeTriageAssessment(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  decision: FinalTriageDecision;
}): Promise<TriageWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  const validated = validateDecision(input.decision);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const intake = await loadIntakeForTriage(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );

    if (String(intake.source_review_status) !== "VERIFIED") {
      throw new Error(
        "Source Review must be VERIFIED before formal ICSR validity and triage.",
      );
    }

    const pending = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM safety_extraction_suggestions
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND status = 'PENDING'`,
      [input.principal.tenantId, intakeRecordId],
    );
    if (Number(pending.rows[0]?.count ?? 0) > 0) {
      throw new Error(
        "Pending extraction suggestions must be resolved before formal triage.",
      );
    }

    const systemSnapshot = await buildSystemSnapshot(
      client,
      input.principal.tenantId,
      intakeRecordId,
      intake,
    );

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(assessment_version), 0) + 1 AS next_version
         FROM safety_triage_assessments
        WHERE tenant_id = $1
          AND intake_record_id = $2`,
      [input.principal.tenantId, intakeRecordId],
    );
    const assessmentVersion = Number(nextVersion.rows[0].next_version);

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO safety_triage_assessments (
         tenant_id, intake_record_id, assessment_version,
         system_validity_recommendation, minimum_criteria,
         human_minimum_criteria, system_snapshot,
         human_validity_decision, seriousness_status, seriousness_criteria,
         special_situations, priority, follow_up_required, follow_up_reasons,
         triage_outcome, rationale, assessed_by
       ) VALUES (
         $1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,
         $8,$9,$10::jsonb,$11::jsonb,$12,$13,$14::jsonb,
         $15,$16,$17
       )
       RETURNING *`,
      [
        input.principal.tenantId,
        intakeRecordId,
        assessmentVersion,
        systemSnapshot.validityRecommendation,
        JSON.stringify(systemSnapshot.criteria),
        JSON.stringify(validated.decision.minimumCriteria),
        JSON.stringify(systemSnapshot),
        validated.decision.humanValidityDecision,
        validated.decision.seriousnessStatus,
        JSON.stringify(validated.decision.seriousnessCriteria),
        JSON.stringify(validated.decision.specialSituations),
        validated.decision.priority,
        validated.decision.followUpRequired,
        JSON.stringify(validated.decision.followUpReasons),
        validated.outcome,
        validated.decision.rationale,
        input.principal.userId,
      ],
    );

    const nextIntakeStatus =
      validated.outcome === "READY_FOR_DUPLICATE_REVIEW"
        ? "DUPLICATE_REVIEW"
        : validated.outcome === "FOLLOW_UP_REQUIRED"
          ? "VALIDITY_REVIEW"
          : "IN_TRIAGE";

    await client.query(
      `UPDATE safety_intake_records
          SET validity_status = $3,
              seriousness_status = $4,
              priority = $5,
              follow_up_required = $6,
              special_situations = $7::jsonb,
              triage_status = 'COMPLETE',
              triage_outcome = $8,
              triaged_at = now(),
              triaged_by = $9,
              status = $10,
              updated_by = $9,
              updated_at = now()
        WHERE tenant_id = $1
          AND id = $2`,
      [
        input.principal.tenantId,
        intakeRecordId,
        validated.decision.humanValidityDecision,
        validated.decision.seriousnessStatus,
        validated.decision.priority,
        validated.decision.followUpRequired,
        JSON.stringify(validated.decision.specialSituations),
        validated.outcome,
        input.principal.userId,
        nextIntakeStatus,
      ],
    );

    await client.query(
      `UPDATE safety_review_tasks
          SET status = 'COMPLETED',
              completed_at = now(),
              outcome = $3::jsonb,
              updated_at = now()
        WHERE tenant_id = $1
          AND entity_type = 'INTAKE_RECORD'
          AND entity_id = $2
          AND task_type = 'TRIAGE'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [
        input.principal.tenantId,
        intakeRecordId,
        JSON.stringify({
          assessmentVersion,
          validity: validated.decision.humanValidityDecision,
          seriousness: validated.decision.seriousnessStatus,
          priority: validated.decision.priority,
          followUpRequired: validated.decision.followUpRequired,
          triageOutcome: validated.outcome,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'ICSR_TRIAGE_FINALIZED','NEXUS_ICSR_TRIAGE','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          assessmentId: inserted.rows[0].id,
          assessmentVersion,
          systemValidityRecommendation: systemSnapshot.validityRecommendation,
          humanValidityDecision: validated.decision.humanValidityDecision,
          seriousnessStatus: validated.decision.seriousnessStatus,
          priority: validated.decision.priority,
          followUpRequired: validated.decision.followUpRequired,
          triageOutcome: validated.outcome,
          rationale: validated.decision.rationale,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getTriageWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}
