import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import { getRuntimeConfig } from "@/lib/enterprise/environment";

import type {
  ReleaseCandidate,
  ReleaseChecklistRecord,
  ReleaseState,
  SmokeRun,
  UatEvidence,
} from "./types";

interface StateRow {
  state_payload: Partial<ReleaseState>;
}

export async function readReleaseState(): Promise<ReleaseState> {
  const environment = getRuntimeConfig().environment;
  const result = await getPostgresPool().query<StateRow>(
    `SELECT state_payload FROM release_governance_state WHERE environment = $1`,
    [environment],
  );
  return normalizeState(result.rows[0]?.state_payload || {});
}

export async function updateChecklistRecord(record: ReleaseChecklistRecord): Promise<ReleaseState> {
  return mutateState(`CHECKLIST_${record.status.toUpperCase()}`, (state) => {
    state.checklist[record.id] = record;
  });
}

export async function appendUatEvidence(evidence: UatEvidence): Promise<ReleaseState> {
  return mutateState(`UAT_${evidence.outcome.toUpperCase()}`, (state) => {
    state.uatEvidence = [evidence, ...state.uatEvidence].slice(0, 250);
  });
}

export async function appendUatEvidenceBatch(evidence: UatEvidence[]): Promise<ReleaseState> {
  return mutateState("AUTOMATED_UAT_RECORDED", (state) => {
    state.uatEvidence = [...evidence, ...state.uatEvidence].slice(0, 250);
  });
}

export async function appendSmokeRun(run: SmokeRun): Promise<ReleaseState> {
  return mutateState(run.passed ? "SMOKE_PASSED" : "SMOKE_FAILED", (state) => {
    state.smokeRuns = [run, ...state.smokeRuns].slice(0, 50);
  });
}

export async function appendReleaseCandidate(candidate: ReleaseCandidate): Promise<ReleaseState> {
  return mutateState("RELEASE_CANDIDATE_CREATED", (state) => {
    state.candidates = [candidate, ...state.candidates].slice(0, 25);
  });
}

async function mutateState(
  action: string,
  mutation: (state: ReleaseState) => void,
): Promise<ReleaseState> {
  const environment = getRuntimeConfig().environment;
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO release_governance_state (environment, state_version, state_payload)
       VALUES ($1, 1, $2::jsonb) ON CONFLICT (environment) DO NOTHING`,
      [environment, JSON.stringify(emptyState())],
    );
    const selected = await client.query<StateRow & { state_version: number }>(
      `SELECT state_version, state_payload FROM release_governance_state
       WHERE environment = $1 FOR UPDATE`,
      [environment],
    );
    const state = normalizeState(selected.rows[0].state_payload);
    mutation(state);
    state.updatedAt = new Date().toISOString();
    const nextVersion = Number(selected.rows[0].state_version) + 1;
    await client.query(
      `UPDATE release_governance_state SET state_version = $2,
         state_payload = $3::jsonb, updated_at = now() WHERE environment = $1`,
      [environment, nextVersion, JSON.stringify(state)],
    );
    await client.query(
      `INSERT INTO release_governance_history (
         environment, state_version, action, state_payload
       ) VALUES ($1, $2, $3, $4::jsonb)`,
      [environment, nextVersion, action, JSON.stringify(state)],
    );
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeState(value: Partial<ReleaseState>): ReleaseState {
  return {
    version: 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    checklist: value.checklist && typeof value.checklist === "object" ? value.checklist : {},
    uatEvidence: Array.isArray(value.uatEvidence) ? value.uatEvidence : [],
    smokeRuns: Array.isArray(value.smokeRuns) ? value.smokeRuns : [],
    candidates: Array.isArray(value.candidates) ? value.candidates : [],
  };
}

function emptyState(): ReleaseState {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    checklist: {},
    uatEvidence: [],
    smokeRuns: [],
    candidates: [],
  };
}
