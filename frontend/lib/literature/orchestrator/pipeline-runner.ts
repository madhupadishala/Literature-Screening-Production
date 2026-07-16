import type {
  LiteraturePipelineRequest,
  LiteraturePipelineResult,
  PipelineStep,
} from "./orchestrator-types";

const STAGES: PipelineStep["stage"][] = [
  "search_strategy",
  "pubmed_search",
  "article_fetch",
  "document_processing",
  "duplicate_detection",
  "embedding",
  "rag",
  "hits_ai",
  "screening_ai",
  "completed",
];

export class PipelineRunner {
  run(
    request: LiteraturePipelineRequest,
  ): LiteraturePipelineResult {
    const now = new Date().toISOString();

    const steps: PipelineStep[] = STAGES.map((stage) => ({
      stage,
      status: "completed",
      startedAt: now,
      completedAt: now,
    }));

    return {
      id: `pipeline_${Date.now()}`,
      tenantId: request.tenantId,
      strategyName: request.strategyName,
      query: request.query,
      steps,
      createdAt: now,
    };
  }
}

export const pipelineRunner = new PipelineRunner();