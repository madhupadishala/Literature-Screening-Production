import { pipelineRunner } from "./pipeline-runner";

import type {
  LiteraturePipelineRequest,
  LiteraturePipelineResult,
  PipelineStatus,
} from "./orchestrator-types";

class LiteratureOrchestrator {
  private history: LiteraturePipelineResult[] = [];

  run(request: LiteraturePipelineRequest) {
    const result = pipelineRunner.run(request);

    this.history.unshift(result);

    return result;
  }

  list(limit = 20) {
    return this.history.slice(0, limit);
  }

  getStatus(): PipelineStatus {
    return {
      totalRuns: this.history.length,
      completedRuns: this.history.length,
    };
  }
}

export const literatureOrchestrator =
  new LiteratureOrchestrator();