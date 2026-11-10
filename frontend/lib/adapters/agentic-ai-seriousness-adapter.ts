import "server-only";

/**
 * Agentic_AI Seriousness Assessment Adapter
 *
 * Bridges Frontend to AG11 (Seriousness Assessment - Python native pipeline)
 *
 * Note: This replaces lib/ai/seriousness-agent-client.ts
 */

const AI_API_BASE = process.env.AGENTIC_AI_API_URL || "http://localhost:8001";

export interface SeriousnessInput {
  caseId: string;
  events: Array<{
    term: string;
    meddraCode?: string;
    outcome?: string;
  }>;
  patient?: {
    age?: number;
    sex?: string;
  };
  products?: Array<{
    name: string;
    role: string;
  }>;
}

export interface SeriousnessResult {
  assessmentId: string;
  isSerious: boolean;
  criteria: {
    death: boolean;
    lifeThreatening: boolean;
    hospitalization: boolean;
    disability: boolean;
    congenitalAnomaly: boolean;
    other: boolean;
  };
  rationale: string;
  confidence: number;
  processingTimeMs: number;
}

export interface SeriousnessAssessmentService {
  assessSeriousness(input: SeriousnessInput): Promise<SeriousnessResult>;
  batchAssess(inputs: SeriousnessInput[]): Promise<SeriousnessResult[]>;
}

export class AgenticAISeriousnessAdapter implements SeriousnessAssessmentService {
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
      throw new Error(`Agentic_AI seriousness assessment failed: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async assessSeriousness(input: SeriousnessInput): Promise<SeriousnessResult> {
    const response = await this.callAgent<SeriousnessResult>("/seriousness/assess", input);
    return response;
  }

  async batchAssess(inputs: SeriousnessInput[]): Promise<SeriousnessResult[]> {
    const response = await this.callAgent<SeriousnessResult[]>("/seriousness/batch-assess", { cases: inputs });
    return response;
  }
}

export function createSeriousnessService(): SeriousnessAssessmentService {
  return new AgenticAISeriousnessAdapter();
}