import "server-only";

import {
  TriageIntakeService,
  type TriageInput,
  type TriageResult,
  type IntakeInput,
  type IntakeResult,
} from "@/lib/contracts/triage-intake";

// Re-export contract types for consumers
export type {
  TriageIntakeService,
  TriageInput,
  TriageResult,
  IntakeInput,
  IntakeResult,
} from "@/lib/contracts/triage-intake";

/**
 * Agentic_AI Triage & Intake Adapter
 *
 * Bridges Frontend to:
 * - AG26: Intake Triage (ML classification)
 * - AG03: Patient Identification
 * - AG04: Reporter Identification
 * - AG09: Clock Start Date (Day Zero)
 */

const AI_API_BASE = process.env.AGENTIC_AI_API_URL || "http://localhost:8001";

interface AgenticAITriageRequest {
  document_id: string;
  document_text: string;
  document_type: string;
  metadata?: Record<string, unknown>;
}

interface AgenticAITriageResponse {
  triage_id: string;
  classification: "valid" | "invalid" | "needs_review";
  priority: "high" | "medium" | "low";
  confidence: number;
  reasons: string[];
  extracted_data: {
    patient?: {
      age?: number;
      age_unit?: string;
      sex?: string;
      weight?: number;
      height?: number;
      medical_history?: string[];
    };
    reporter?: {
      type: string;
      qualification?: string;
      country?: string;
      contact_info?: Record<string, string>;
    };
    products: Array<{
      name: string;
      role: string;
      strength?: string;
      dose?: string;
      route?: string;
      frequency?: string;
      indication?: string;
      start_date?: string;
      end_date?: string;
    }>;
    adverse_events: Array<{
      term: string;
      meddra_code?: string;
      meddra_version?: string;
      seriousness: string;
      onset_date?: string;
      outcome?: string;
    }>;
    seriousness?: {
      is_serious: boolean;
      criteria: Record<string, boolean>;
    };
  };
  processing_time_ms: number;
}

interface AgenticAIIntakeRequest {
  source_id: string;
  source_type: string;
  documents: Array<{
    id: string;
    file_name: string;
    mime_type: string;
    content?: string;
    url?: string;
    hash: string;
  }>;
  metadata?: Record<string, unknown>;
}

interface AgenticAIIntakeResponse {
  intake_id: string;
  status: "received" | "processing" | "completed" | "failed";
  triage_results: AgenticAITriageResponse[];
  created_cases: string[];
  processing_time_ms: number;
  errors?: string[];
}

function mapSeriousnessCriteria(criteria: Record<string, boolean>): {
  death: boolean;
  lifeThreatening: boolean;
  hospitalization: boolean;
  disability: boolean;
  congenitalAnomaly: boolean;
  other: boolean;
} {
  return {
    death: criteria.death === true,
    lifeThreatening: criteria.life_threatening === true || criteria.lifeThreatening === true,
    hospitalization: criteria.hospitalization === true,
    disability: criteria.disability === true,
    congenitalAnomaly: criteria.congenital_anomaly === true || criteria.congenitalAnomaly === true,
    other: criteria.other === true,
  };
}

export class AgenticAITriageAdapter implements TriageIntakeService {
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
      throw new Error(`Agentic_AI triage failed: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async triageDocument(input: TriageInput): Promise<TriageResult> {
    const response = await this.callAgent<AgenticAITriageResponse>("/triage/single", {
      document_id: input.documentId,
      document_text: input.documentText,
      document_type: input.documentType,
      metadata: input.metadata,
    });

    return this.mapTriageResponse(response);
  }

  async triageDocuments(inputs: TriageInput[]): Promise<TriageResult[]> {
    // Batch process via multiple calls (Agentic_AI may not have batch endpoint yet)
    return Promise.all(inputs.map(input => this.triageDocument(input)));
  }

  async processIntake(input: IntakeInput): Promise<IntakeResult> {
    const response = await this.callAgent<AgenticAIIntakeResponse>("/intake/process", {
      source_id: input.sourceId,
      source_type: input.sourceType,
      documents: input.documents,
      metadata: input.metadata,
    });

    return {
      intakeId: response.intake_id,
      status: response.status,
      triageResults: response.triage_results.map(r => this.mapTriageResponse(r)),
      createdCases: response.created_cases,
      processingTimeMs: response.processing_time_ms,
      errors: response.errors,
    };
  }

  async getTriageConfig(): Promise<{ rules: string[]; thresholds: Record<string, number> }> {
    const response = await fetch(`${AI_API_BASE}/triage/config`, { cache: "no-store" });
    if (!response.ok) {
      return { rules: [], thresholds: {} };
    }
    return response.json();
  }

  async updateTriageConfig(config: { rules: string[]; thresholds: Record<string, number> }): Promise<void> {
    const response = await fetch(`${AI_API_BASE}/triage/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error("Failed to update triage config");
    }
  }

  private mapTriageResponse(r: AgenticAITriageResponse): TriageResult {
    return {
      triageId: r.triage_id,
      classification: r.classification,
      priority: r.priority,
      confidence: r.confidence,
      reasons: r.reasons,
      extractedData: {
        patient: r.extracted_data.patient ? {
          age: r.extracted_data.patient.age,
          ageUnit: r.extracted_data.patient.age_unit as "year" | "month" | "day" | undefined,
          sex: r.extracted_data.patient.sex as "male" | "female" | "unknown" | undefined,
          weight: r.extracted_data.patient.weight,
          height: r.extracted_data.patient.height,
          medicalHistory: r.extracted_data.patient.medical_history,
        } : undefined,
        reporter: r.extracted_data.reporter ? {
          type: r.extracted_data.reporter.type as "healthcare_professional" | "consumer" | "regulatory" | "literature" | "other",
          qualification: r.extracted_data.reporter.qualification,
          country: r.extracted_data.reporter.country,
          contactInfo: r.extracted_data.reporter.contact_info,
        } : undefined,
        products: r.extracted_data.products.map(p => ({
          name: p.name,
          role: p.role as "suspect" | "concomitant" | "interacting",
          strength: p.strength,
          dose: p.dose,
          route: p.route,
          frequency: p.frequency,
          indication: p.indication,
          startDate: p.start_date,
          endDate: p.end_date,
        })),
        adverseEvents: r.extracted_data.adverse_events.map(e => ({
          term: e.term,
          meddraCode: e.meddra_code,
          meddraVersion: e.meddra_version,
          seriousness: e.seriousness as "serious" | "non-serious",
          onsetDate: e.onset_date,
          outcome: e.outcome as "recovered" | "recovering" | "not_recovered" | "fatal" | "unknown",
        })),
        seriousness: r.extracted_data.seriousness ? {
          isSerious: r.extracted_data.seriousness.is_serious,
          criteria: mapSeriousnessCriteria(r.extracted_data.seriousness.criteria),
        } : undefined,
      },
      processingTimeMs: r.processing_time_ms,
    };
  }
}

export function createTriageIntakeService(): TriageIntakeService {
  return new AgenticAITriageAdapter();
}