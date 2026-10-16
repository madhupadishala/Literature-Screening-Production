/** Concrete, server-only engine registration for the native Unix-socket worker.
 * Host injects approved COI provider and narrative draft renderer; missing
 * dependencies prevent registration. No browser/session principals.
 */
import { runCOI, type Segment } from '../ai/coi/coi-agent';
import { evaluateTriageSnapshot } from '../safety/triage/triage-evaluator';
import { assessListedness } from '../../../Agentic_AI/AG12_Listedness_Expectedness/src/branches/consolidate__nexus-shared-agents/platform/shared-agents/candidates/listedness/listedness-engine';
import { assessPvSafety } from '../../../Agentic_AI/AG17_Safety_Information_Detection/src/branches/feat__pv-safety-assessment-engine-v1/frontend/lib/pv-safety-assessment/assessment-engine';
import type { AIProvider } from '../ai/ai-types';

type JsonObject = Record<string, unknown>;
export type NativeRequest = {
  agent_id: string; tenant_id: string; client_id: string;
  document_id: string; input: string | JsonObject; knowledge_citations: unknown[];
};
type EngineFn = (request: NativeRequest) => Promise<JsonObject> | JsonObject;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('required object');
  return value as JsonObject;
}
function nonempty(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('required nonempty string');
  return value;
}
function scopedInput(request: NativeRequest): JsonObject {
  const data = object(request.input);
  if (data.document_id !== request.document_id) throw new Error('source identity mismatch');
  return object(data.source);
}

export function registerRecoveredNativeAgents(deps: {
  countryProvider: AIProvider;
  // This must be the approved non-persisting native narrative engine, NOT
  // generateSystemNarrative() which writes to the case DB.
  narrativeDraft: (source: JsonObject, request: NativeRequest) => Promise<JsonObject>;
}): Record<string, EngineFn> {
  if (!deps?.countryProvider || typeof deps.countryProvider.complete !== 'function' ||
      typeof deps.narrativeDraft !== 'function') {
    throw new Error('approved COI and non-persisting narrative engines required');
  }
  const handlers: Record<string, EngineFn> = {
    AG08: async (r) => {
      const text = nonempty(r.input);
      const segments: Segment[] = [{id:r.document_id, text, locator:'synthetic/source'}];
      return {assessment: await runCOI(segments,deps.countryProvider,
                  'native-'+r.document_id)};
    },
    AG12: (r) => {
      const source = scopedInput(r);
      const body = object(r.input);
      const reportedEvent = nonempty(source.reportedEvent);
      const labelEvidence = source.labelEvidence;
      if (!Array.isArray(labelEvidence)) throw new Error('controlled labeling evidence required');
      if (body.document_id !== r.document_id) throw new Error('labeling source mismatch');
      return {assessment: assessListedness({reportedEvent,labelEvidence} as Parameters<typeof assessListedness>[0]) as unknown as JsonObject};
    },
    AG17: (r) => {
      const source = scopedInput(r);
      if (!Array.isArray(source.products) || !Array.isArray(source.specialSituations) ||
          typeof source.sourceCoverage !== 'string') {
        throw new Error('AG17 requires governed structured product and safety evidence');
      }
      return {assessment: assessPvSafety(source as Parameters<typeof assessPvSafety>[0]) as unknown as JsonObject};
    },
    AG20: async (r) => {
      const source = scopedInput(r);
      const draft = object(await deps.narrativeDraft(source,r));
      return {assessment:draft};
    },
    AG26: (r) => {
      const source = scopedInput(r);
      for (const field of ['patients','reporters','products','events']) {
        if (!Array.isArray(source[field])) throw new Error('missing triage entity list');
      }
      return {assessment:evaluateTriageSnapshot(source as Parameters<typeof evaluateTriageSnapshot>[0]) as unknown as JsonObject};
    },
  };
  return Object.fromEntries(Object.entries(handlers).map(([agent_id,engine]) => [
    agent_id,
    async (request:NativeRequest) => {
      if (request.agent_id !== agent_id ||
          !nonempty(request.tenant_id) || !nonempty(request.client_id) ||
          !nonempty(request.document_id) || !Array.isArray(request.knowledge_citations)) {
        throw new Error('unverified source routing');
      }
      const result = object(await engine(request));
      const assessment=object(result.assessment);
      return Object.freeze({
        agent_id,tenant_id:request.tenant_id,client_id:request.client_id,
        document_id:request.document_id,status:'review_required' as const,
        requires_human_review:true as const,
        assessment:{...assessment,manualReviewRequired:true,qualifiedForAutonomousUse:false},
      });
    },
  ]));
}
