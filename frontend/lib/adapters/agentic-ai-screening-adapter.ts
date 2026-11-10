import "server-only";

import {
  ScreeningService,
  ScreeningWorkflowService,
  type ScreeningCriteria,
  type ScreeningRecord,
  type ScreeningDecision,
  type ScreeningResult,
} from "@/lib/contracts/screening";

// Re-export contract types for consumers
export type {
  ScreeningService,
  ScreeningWorkflowService,
  ScreeningCriteria,
  ScreeningRecord,
  ScreeningDecision,
  ScreeningResult,
} from "@/lib/contracts/screening";

/**
 * Agentic_AI Screening Adapter
 *
 * Bridges Frontend to Agentic_AI AG17 (Safety Assessment Engine)
 * for ML-powered screening decisions.
 *
 * Note: Frontend owns the screening WORKFLOW (orchestration, UI, reviewer assignment).
 * Agentic_AI owns the ML CLASSIFICATION (include/exclude/maybe with confidence).
 */

const AI_API_BASE = process.env.AGENTIC_AI_API_URL || "http://localhost:8001";

interface AgenticAIScreenRequest {
  record: ScreeningRecord;
  criteria: ScreeningCriteria;
}

interface AgenticAIScreenResponse {
  decision: "include" | "exclude" | "maybe";
  confidence: number;
  rationale: string;
  matched_criteria: {
    inclusion: string[];
    exclusion: string[];
  };
  aiExecution: {
    provider: string;
    model: string;
    requestId: string;
    latencyMs: number;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      attempts: number;
    };
  };
}

interface AgenticAIBatchScreenRequest {
  records: ScreeningRecord[];
  criteria: ScreeningCriteria;
}

interface AgenticAIBatchScreenResponse {
  decisions: Array<{
    record_id: string;
    decision: "include" | "exclude" | "maybe";
    confidence: number;
    rationale: string;
    matched_criteria: {
      inclusion: string[];
      exclusion: string[];
    };
  }>;
  summary: {
    total: number;
    included: number;
    excluded: number;
    maybe: number;
  };
  processing_time_ms: number;
}

export class AgenticAIScreeningAdapter implements ScreeningService, ScreeningWorkflowService {
  private async callAgent<T>(endpoint: string, payload: unknown): Promise<T> {
    const response = await fetch(`${AI_API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Source": "nexus-frontend",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(`Agentic_AI screening failed: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // --- ScreeningService ---

  async screenRecord(record: ScreeningRecord, criteria: ScreeningCriteria): Promise<{
    recordId: string;
    decision: "include" | "exclude" | "maybe";
    confidence: number;
    rationale: string;
    matchedCriteria: { inclusion: string[]; exclusion: string[] };
    aiExecution: {
      provider: string;
      model: string;
      requestId: string;
      latencyMs: number;
      tokenUsage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        attempts: number;
      };
    };
  }> {
    const response = await this.callAgent<AgenticAIScreenResponse>("/screening/single", { record, criteria });

    return {
      recordId: record.id,
      decision: response.decision,
      confidence: response.confidence,
      rationale: response.rationale,
      matchedCriteria: response.matched_criteria,
      aiExecution: response.aiExecution,
    };
  }

  async screenRecords(records: ScreeningRecord[], criteria: ScreeningCriteria): Promise<ScreeningResult> {
    const response = await this.callAgent<AgenticAIBatchScreenResponse>("/screening/batch", { records, criteria });

    return {
      decisions: response.decisions.map(d => ({
        recordId: d.record_id,
        decision: d.decision,
        confidence: d.confidence,
        rationale: d.rationale,
        matchedCriteria: d.matched_criteria,
      })),
      summary: response.summary,
      processingTimeMs: response.processing_time_ms,
    };
  }

  async getCriteria(projectId: string): Promise<ScreeningCriteria> {
    // Criteria stored in Nexus DB, not Agentic_AI
    // This would call a Nexus API endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/screening-criteria`, {
      cache: "no-store",
    });

    if (!response.ok) {
      // Return defaults
      return {
        inclusionCriteria: ["human", "adverse event", "drug exposure"],
        exclusionCriteria: ["animal only", "in vitro only", "no drug"],
      };
    }

    return response.json();
  }

  async saveCriteria(projectId: string, criteria: ScreeningCriteria): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/screening-criteria`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(criteria),
    });

    if (!response.ok) {
      throw new Error("Failed to save screening criteria");
    }
  }

  // --- ScreeningWorkflowService ---

  async startWorkflow(input: {
    projectId: string;
    records: ScreeningRecord[];
    criteria: ScreeningCriteria;
    reviewers: string[];
  }): Promise<{ workflowId: string; status: string }> {
    // Workflow orchestration stays in Frontend/Nexus
    // This creates a workflow record in Nexus DB
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/screening/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error("Failed to start screening workflow");
    }

    return response.json();
  }

  async getWorkflowStatus(workflowId: string): Promise<{
    status: "pending" | "in_progress" | "completed" | "failed";
    progress: number;
    results?: ScreeningResult;
  }> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/screening/workflows/${workflowId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to get workflow status");
    }

    return response.json();
  }

  async submitDecision(workflowId: string, decision: ScreeningDecision): Promise<void> {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/screening/workflows/${workflowId}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });

    if (!response.ok) {
      throw new Error("Failed to submit decision");
    }
  }
}

/**
 * Factory for creating screening service
 */
export function createScreeningService(): ScreeningService & ScreeningWorkflowService {
  return new AgenticAIScreeningAdapter();
}