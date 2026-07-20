import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { getReleaseConfig } from "./release-config";
import type {
  ReleaseCandidate,
  ReleaseChecklistRecord,
  ReleaseState,
  SmokeRun,
  UatEvidence,
} from "./types";

const STATE_FILE = "release-state.json";
const TEMP_FILE = "release-state.tmp.json";

let writeQueue: Promise<void> = Promise.resolve();

export async function readReleaseState(): Promise<ReleaseState> {
  const config = getReleaseConfig();
  await mkdir(config.stateDirectory, { recursive: true });
  const statePath = path.join(config.stateDirectory, STATE_FILE);

  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<ReleaseState>;
    return normalizeState(parsed);
  } catch (error) {
    if (isMissingFile(error)) return emptyState();
    throw error;
  }
}

export async function updateChecklistRecord(
  record: ReleaseChecklistRecord,
): Promise<ReleaseState> {
  return mutateState((state) => {
    state.checklist[record.id] = record;
  });
}

export async function appendUatEvidence(evidence: UatEvidence): Promise<ReleaseState> {
  return mutateState((state) => {
    state.uatEvidence = [evidence, ...state.uatEvidence].slice(0, 250);
  });
}

export async function appendUatEvidenceBatch(
  evidence: UatEvidence[],
): Promise<ReleaseState> {
  return mutateState((state) => {
    state.uatEvidence = [...evidence, ...state.uatEvidence].slice(0, 250);
  });
}

export async function appendSmokeRun(run: SmokeRun): Promise<ReleaseState> {
  return mutateState((state) => {
    state.smokeRuns = [run, ...state.smokeRuns].slice(0, 50);
  });
}

export async function appendReleaseCandidate(
  candidate: ReleaseCandidate,
): Promise<ReleaseState> {
  return mutateState((state) => {
    state.candidates = [candidate, ...state.candidates].slice(0, 25);
  });
}

async function mutateState(
  mutation: (state: ReleaseState) => void,
): Promise<ReleaseState> {
  let output: ReleaseState = emptyState();

  writeQueue = writeQueue.then(async () => {
    const state = await readReleaseState();
    mutation(state);
    state.updatedAt = new Date().toISOString();
    await writeState(state);
    output = state;
  });

  await writeQueue;
  return output;
}

async function writeState(state: ReleaseState): Promise<void> {
  const config = getReleaseConfig();
  await mkdir(config.stateDirectory, { recursive: true });

  const statePath = path.join(config.stateDirectory, STATE_FILE);
  const temporaryPath = path.join(config.stateDirectory, TEMP_FILE);
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, statePath);
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

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT",
  );
}
