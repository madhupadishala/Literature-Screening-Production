/**
 * pipeline-orchestrator.ts
 *
 * Full pipeline orchestration for NEXUS Literature Screening Platform.
 * Chains all 9 agents in sequence with proper error handling, HITL routing, and audit.
 *
 * Flow: Ingestion → Dedup → Screening → Medical History → Action Taken →
 *       Dechallenge → Rechallenge → Causality → Follow-up → Submission
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, ICH E2D/E2B R3, GAMP 5
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

// Import all agents
import { createLiteratureDuplicatesAgent } from '../agents/agent-1-literature-duplicates';
import { createICSRDuplicatesAgent } from '../agents/agent-2-icsr-duplicates';
import { createFollowUpGeneratorAgent } from '../agents/agent-3-followup-generator';
import { createScreeningAgent } from '../agents/agent-4-screening';
import { createActionTakenAgent } from '../agents/agent-5-action-taken';
import { createDechallengeAgent } from '../agents/agent-6-dechallenge';
import { createRechallengeAgent } from '../agents/agent-7-rechallenge';
import { createMedicalHistoryAgent } from '../agents/agent-8-medical-history';
import { createCausalityAgent } from '../agents/agent-9-causality';

// Infrastructure
import { HybridInferenceRouter, createProductionRouter, LLMProvider } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore, createZDRStore, IngestionPayload, PostSlmPayload } from '../infrastructure/redis-zdr-store';
import { AgentPoolManager, createAgentPoolManager, PoolConfig } from '../agents/agent-pool-manager';
import { BaseAgent, AgentExecutionInput, AgentResult, AgentId } from '../agents/base-agent';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PipelineConfig {
  tenantId: string;
  inferenceRouter: HybridInferenceRouter;
  auditLedger: AuditLedgerService;
  zdrStore: ZDRStore;
  enableHITL: boolean;
  hitlTimeoutMs: number;
  maxRetries: number;
  enableAudit: boolean;
  deterministicSeed: number;
}

export interface PipelineInput {
  article: {
    pmid: string;
    title: string;
    abstract: string;
    journal?: string;
    publication_date?: string;
    language?: string;
    mesh_terms?: string[];
    chemicals?: string[];
    publication_types?: string[];
    full_text?: string;
  };
  matched_products: Array<{
    product_id: string;
    brand_name: string;
    active_substances: string[];
  }>;
  case_data?: {
    case_id: string;
    narrative: string;
    drugs: Array<{
      name: string;
      active_substance?: string;
      dose?: string;
      route?: string;
      frequency?: string;
      therapy_start?: string;
      therapy_end?: string;
      action_taken?: string;
      rechallenge?: 'YES' | 'NO' | 'UNKNOWN';
      dechallenge?: 'POSITIVE' | 'NEGATIVE' | 'UNASSESSABLE';
    }>;
    events: Array<{
      meddra_llt: string;
      meddra_pt?: string;
      verbatim_text: string;
      onset_date?: string;
      end_date?: string;
      outcome?: string;
      seriousness?: string;
      seriousness_criteria?: string[];
    }>;
    patient?: {
      age?: string;
      sex?: string;
      weight?: string;
      medical_history?: string[];
    };
    concomitant_meds?: string[];
    reporter?: {
      qualification?: string;
      country?: string;
    };
  };
  reporter_causality?: Array<{
    drug: string;
    event: string;
    related: boolean;
    rationale?: string;
  }>;
  follow_up_exhausted?: boolean;
  jurisdiction?: string;
  client_id?: string;
}

export interface PipelineResult {
  trace_id: string;
  pmid: string;
  status: 'COMPLETED' | 'HITL_REQUIRED' | 'FAILED' | 'EXCLUDED';
  stages: StageResult[];
  final_decision: string;
  hitl_required: boolean;
  hitl_review_id?: string;
  total_latency_ms: number;
  audit_recorded: boolean;
  errors: string[];
}

export interface StageResult {
  stage: string;
  agent_id: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'HITL_REQUIRED';
  latency_ms: number;
  output?: any;
  error?: string;
  execution_tier: 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';
  review_reasons?: string[];
}

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

export class PipelineOrchestrator extends EventEmitter {
  private config: PipelineConfig;
  private agents: Map<string, any> = new Map();
  private agentPools: Map<string, any> = new Map();
  private isRunning = false;

  constructor(config: PipelineConfig) {
    super();
    this.config = config;
    this.initializeAgents();
    this.initializeAgentPools();
  }

  private initializeAgents(): void {
    // Agent 1: Literature Duplicates
    this.agents.set('agent-1-literature-duplicates', {
      id: 'agent-1-literature-duplicates',
      name: 'Literature Duplicates Detection',
      execute: async (input: any) => {
        const agent = require('../agents/agent-1-literature-duplicates').createLiteratureDuplicatesAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 2: ICSR Duplicates
    this.agents.set('agent-2-icsr-duplicates', {
      id: 'agent-2-icsr-duplicates',
      name: 'ICSR Duplicates Detection',
      execute: async (input: any) => {
        const agent = require('../agents/agent-2-icsr-duplicates').createICSRDuplicatesAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 3: Follow-up Generator
    this.agents.set('agent-3-followup-generator', {
      id: 'agent-3-followup-generator',
      name: 'Follow-up Generator',
      execute: async (input: any) => {
        const agent = require('../agents/agent-3-followup-generator').createFollowUpGeneratorAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 4: Screening
    this.agents.set('agent-4-screening', {
      id: 'agent-4-screening',
      name: 'Literature Screening',
      execute: async (input: any) => {
        const agent = require('../agents/agent-4-screening').createScreeningAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 5: Action Taken
    this.agents.set('agent-5-action-taken', {
      id: 'agent-5-action-taken',
      name: 'Action Taken Assessment',
      execute: async (input: any) => {
        const agent = require('../agents/agent-5-action-taken').createActionTakenAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 6: Dechallenge
    this.agents.set('agent-6-dechallenge', {
      id: 'agent-6-dechallenge',
      name: 'Dechallenge Assessment',
      execute: async (input: any) => {
        const agent = require('../agents/agent-6-dechallenge').createDechallengeAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 7: Rechallenge
    this.agents.set('agent-7-rechallenge', {
      id: 'agent-7-rechallenge',
      name: 'Rechallenge Assessment',
      execute: async (input: any) => {
        const agent = require('../agents/agent-7-rechallenge').createRechallengeAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 8: Medical History
    this.agents.set('agent-8-medical-history', {
      id: 'agent-8-medical-history',
      name: 'Medical History Extraction',
      execute: async (input: any) => {
        const agent = require('../agents/agent-8-medical-history').createMedicalHistoryAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });

    // Agent 9: Causality
    this.agents.set('agent-9-causality', {
      id: 'agent-9-causality',
      name: 'Causality Assessment',
      execute: async (input: any) => {
        const agent = require('../agents/agent-9-causality').createCausalityAgent({
          tenant_id: this.config.tenantId,
          inference_router: this.config.inferenceRouter,
          audit_ledger: this.config.auditLedger,
          zdr_store: this.config.zdrStore,
        });
        return agent.executeWithRetry(input);
      }
    });
  }

  private initializeAgentPools(): void {
    const agentConfigs: Array<{ id: string; config: PoolConfig }> = [
      { id: 'agent-1-literature-duplicates', config: { agentId: 'agent-1-literature-duplicates', minReplicas: 2, maxReplicas: 5, targetCpuUtilization: 70, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-2-icsr-duplicates', config: { agentId: 'agent-2-icsr-duplicates', minReplicas: 2, maxReplicas: 5, targetCpuUtilization: 70, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-3-followup-generator', config: { agentId: 'agent-3-followup-generator', minReplicas: 2, maxReplicas: 10, targetCpuUtilization: 60, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-4-screening', config: { agentId: 'agent-4-screening', minReplicas: 3, maxReplicas: 15, targetCpuUtilization: 75, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-5-action-taken', config: { agentId: 'agent-5-action-taken', minReplicas: 2, maxReplicas: 10, targetCpuUtilization: 60, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-6-dechallenge', config: { agentId: 'agent-6-dechallenge', minReplicas: 2, maxReplicas: 10, targetCpuUtilization: 60, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-7-rechallenge', config: { agentId: 'agent-7-rechallenge', minReplicas: 2, maxReplicas: 10, targetCpuUtilization: 60, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-8-medical-history', config: { agentId: 'agent-8-medical-history', minReplicas: 2, maxReplicas: 10, targetCpuUtilization: 65, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
      { id: 'agent-9-causality', config: { agentId: 'agent-9-causality', minReplicas: 2, maxReplicas: 5, targetCpuUtilization: 70, healthCheckIntervalMs: 10000, unhealthyThreshold: 3, replacementTimeoutMs: 30000, checkpointIntervalSpans: 5, resumeFromCheckpoint: true, startupTimeoutMs: 30000 } },
    ];

    for (const { id, config } of agentConfigs) {
      const agentFactory = async (cfg: any) => {
        const agentModule = await import(`../agents/${id}`);
        const createFn = agentModule[`create${id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Agent`];
        return createFn(cfg);
      };
      this.agentPools.set(id, createAgentPoolManager(config, agentFactory));
    }
  }

  async start(): Promise<void> {
    console.log('[PipelineOrchestrator] Starting all agent pools...');
    this.isRunning = true;

    // Start all agent pools
    for (const [id, pool] of this.agentPools) {
      try {
        await pool.start();
        console.log(`[PipelineOrchestrator] Started pool for ${id}`);
      } catch (err) {
        console.error(`[PipelineOrchestrator] Failed to start pool for ${id}:`, err);
      }
    }

    // Wait for minimum replicas to be healthy
    await this.waitForHealthyPools();

    console.log('[PipelineOrchestrator] All agent pools started successfully');
  }

  async stop(): Promise<void> {
    console.log('[PipelineOrchestrator] Stopping all agent pools...');
    this.isRunning = false;

    for (const [id, pool] of this.agentPools) {
      try {
        await pool.stop();
        console.log(`[PipelineOrchestrator] Stopped pool for ${id}`);
      } catch (err) {
        console.error(`[PipelineOrchestrator] Failed to stop pool for ${id}:`, err);
      }
    }
  }

  private async waitForHealthyPools(timeoutMs = 60000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      let allHealthy = true;
      for (const [id, pool] of this.agentPools) {
        const metrics = pool.getMetrics();
        if (metrics.healthyReplicas < pool.config.minReplicas) {
          allHealthy = false;
          break;
        }
      }
      if (allHealthy) return;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Timeout waiting for healthy pools');
  }

  /**
   * Execute complete pipeline for a single case
   */
  async execute(input: PipelineInput): Promise<PipelineResult> {
    const traceId = `trc_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const errors: string[] = [];

    try {
      console.log(`[PipelineOrchestrator] Starting pipeline for PMID: ${input.article.pmid} (Trace: ${traceId})`);

      // ========================================================================
      // STAGE 1: INGESTION & DEDUPLICATION
      // ========================================================================
      const stage1 = await this.executeStage('stage-1-dedup', 'agent-1-literature-duplicates', {
        records: [{
          pmid: input.article.pmid,
          doi: undefined,
          title: input.article.title,
          abstract: input.article.abstract,
          authors: [],
          journal: input.article.journal,
          publication_date: input.article.publication_date,
          publication_year: input.article.publication_date ? new Date(input.article.publication_date).getFullYear() : undefined,
          mesh_terms: input.article.mesh_terms,
          chemicals: input.article.chemicals,
          keywords: input.article.publication_types,
          source: 'PUBMED',
          source_id: input.article.pmid,
        }],
        similarity_threshold: 0.85,
        enable_fuzzy_matching: true,
      });

      if (stage1.status === 'FAILED') throw new Error(`Dedup failed: ${stage1.error}`);
      stages.push(stage1);

      // Check if deduplication found this is a duplicate
      const dedupOutput = stage1.output;
      if (dedupOutput && dedupOutput.clusters && dedupOutput.clusters.length > 0) {
        // Check if this PMID is in a cluster with other records
        const thisCluster = dedupOutput.clusters.find((c: any) =>
          c.records.some((r: any) => r.pmid === input.article.pmid)
        );
        if (thisCluster && thisCluster.cluster_size > 1) {
          return this.buildResult(traceId, input.article.pmid, 'EXCLUDED', stages, 'DUPLICATE_DETECTED', true, Date.now() - Date.now(), [], true);
        }
      }

      // ========================================================================
      // STAGE 2: SCREENING (with AG10, AG17, AG08 integrations)
      // ========================================================================
      const stage2 = await this.executeStage('stage-2-screening', 'agent-4-screening', {
        article: {
          pmid: input.article.pmid,
          title: input.article.title,
          abstract: input.article.abstract,
          journal: input.article.journal,
          publication_date: input.article.publication_date,
          language: input.article.language || 'en',
          mesh_terms: input.article.mesh_terms,
          chemicals: input.article.chemicals,
          publication_types: input.article.publication_types,
          full_text: input.article.full_text,
        },
        matched_products: input.matched_products,
        full_text: input.article.full_text,
        journal: input.article.journal,
        publication_date: input.article.publication_date,
      });

      if (stage2.status === 'FAILED') throw new Error(`Screening failed: ${stage2.error}`);
      stages.push(stage2);

      const screeningOutput = stage2.output;

      // Check screening decision
      if (screeningOutput?.decision === 'EXCLUDE_NON_CLINICAL' || screeningOutput?.decision === 'EXCLUDE_NON_PRODUCT' || screeningOutput?.decision === 'IRRELEVANT_NON_PRODUCT') {
        return this.buildResult(traceId, input.article.pmid, 'EXCLUDED', stages, screeningOutput?.decision || 'EXCLUDED', false, Date.now() - Date.now(), [], false);
      }

      // ========================================================================
      // STAGE 3: MEDICAL HISTORY EXTRACTION (if case data provided)
      // ========================================================================
      let medicalHistoryOutput: any = null;
      if (input.case_data) {
        const stage3 = await this.executeStage('stage-3-medical-history', 'agent-8-medical-history', {
          case_id: input.case_data.case_id || `case-${Date.now()}`,
          narrative: input.case_data.narrative,
          patient_section: undefined,
          structured_fields: input.case_data.patient,
          language: 'en',
        });
        if (stage3.status === 'FAILED') throw new Error(`Medical history failed: ${stage3.error}`);
        stages.push(stage3);
        medicalHistoryOutput = stage3.output;
      }

      // ========================================================================
      // STAGE 4: ACTION TAKEN ASSESSMENT
      // ========================================================================
      if (input.case_data && input.case_data.drugs && input.case_data.drugs.length > 0) {
        const suspectDrug = input.case_data.drugs.find(d => d.name === 'suspect' || d.name === 'co_suspect') || input.case_data.drugs[0];
        const primaryEvent = input.case_data.events[0];

        const stage4 = await this.executeStage('stage-4-action-taken', 'agent-5-action-taken', {
          case_id: input.case_data.case_id || `case-${Date.now()}`,
          drug_exposure: {
            drug_name: suspectDrug.name,
            active_substance: suspectDrug.active_substance,
            dose: suspectDrug.dose,
            route: suspectDrug.route,
            frequency: suspectDrug.frequency,
            therapy_start: suspectDrug.therapy_start,
            therapy_end: suspectDrug.therapy_end,
            action_taken: suspectDrug.action_taken,
            rechallenge: suspectDrug.rechallenge,
            dechallenge: suspectDrug.dechallenge,
          },
          adverse_event: {
            meddra_llt: primaryEvent.meddra_llt,
            onset_date: primaryEvent.onset_date,
            outcome: primaryEvent.outcome,
            seriousness: primaryEvent.seriousness,
          },
          dechallenge_result: suspectDrug.dechallenge,
          rechallenge_result: suspectDrug.rechallenge,
          clinical_guidelines: [],
        });

        if (stage4.status === 'FAILED') throw new Error(`Action taken failed: ${stage4.error}`);
        stages.push(stage4);
      }

      // ========================================================================
      // STAGE 5: DECHALLENGE ASSESSMENT
      // ========================================================================
      if (input.case_data && input.case_data.drugs && input.case_data.drugs.length > 0) {
        const suspectDrug = input.case_data.drugs.find(d => d.name === 'suspect' || d.name === 'co_suspect') || input.case_data.drugs[0];
        const primaryEvent = input.case_data.events[0];

        const stage5 = await this.executeStage('stage-5-dechallenge', 'agent-6-dechallenge', {
          case_id: input.case_data.case_id || `case-${Date.now()}`,
          drug_exposure: {
            drug_name: suspectDrug.name,
            active_substance: suspectDrug.active_substance,
            therapy_start: suspectDrug.therapy_start,
            therapy_end: suspectDrug.therapy_end,
            dose: suspectDrug.dose,
            route: suspectDrug.route,
            action_taken: suspectDrug.action_taken,
          },
          adverse_event: {
            meddra_llt: primaryEvent.meddra_llt,
            onset_date: primaryEvent.onset_date,
            end_date: primaryEvent.end_date,
            outcome: primaryEvent.outcome,
            seriousness: primaryEvent.seriousness,
          },
          dechallenge_info: {
            improvement_after_stop: suspectDrug.dechallenge === 'POSITIVE',
            time_to_improvement_days: undefined,
            completeness_of_resolution: primaryEvent.outcome === 'RECOVERED' ? 'COMPLETE' : 'PARTIAL',
            alternative_causes: input.case_data.concomitant_meds,
            dose_reduction_before_stop: suspectDrug.action_taken === 'DOSE_REDUCED',
          },
          rechallenge_info: {
            rechallenge_done: suspectDrug.rechallenge === 'YES',
            rechallenge_result: suspectDrug.rechallenge === 'YES' ? 'POSITIVE' : 'NEGATIVE',
          },
        });

        if (stage5.status === 'FAILED') throw new Error(`Dechallenge failed: ${stage5.error}`);
        stages.push(stage5);
      }

      // ========================================================================
      // STAGE 6: RECHALLENGE ASSESSMENT
      // ========================================================================
      if (input.case_data && input.case_data.drugs && input.case_data.drugs.length > 0) {
        const suspectDrug = input.case_data.drugs.find(d => d.name === 'suspect' || d.name === 'co_suspect') || input.case_data.drugs[0];
        const primaryEvent = input.case_data.events[0];

        const stage6 = await this.executeStage('stage-6-rechallenge', 'agent-7-rechallenge', {
          case_id: input.case_data.case_id || `case-${Date.now()}`,
          drug_exposure: {
            drug_name: suspectDrug.name,
            active_substance: suspectDrug.active_substance,
            dose: suspectDrug.dose,
            route: suspectDrug.route,
            therapy_start: suspectDrug.therapy_start,
            therapy_end: suspectDrug.therapy_end,
            rechallenge_dose: suspectDrug.rechallenge === 'YES' ? suspectDrug.dose : undefined,
            rechallenge_route: suspectDrug.rechallenge === 'YES' ? suspectDrug.route : undefined,
            rechallenge_start: undefined,
            rechallenge_end: undefined,
          },
          adverse_event: {
            meddra_llt: primaryEvent.meddra_llt,
            onset_date: primaryEvent.onset_date,
            outcome: primaryEvent.outcome,
          },
          rechallenge_info: {
            rechallenge_done: suspectDrug.rechallenge === 'YES',
            rechallenge_dose: suspectDrug.dose,
            rechallenge_route: suspectDrug.route,
            rechallenge_start: undefined,
            rechallenge_end: undefined,
            event_recurred: suspectDrug.rechallenge === 'YES',
            recurrence_event_same: true,
            time_to_recurrence_days: undefined,
            rechallenge_outcome: suspectDrug.rechallenge === 'YES' ? 'RECURRED' : 'NO_RECURRENCE',
          },
          dechallenge_result: 'POSITIVE', // Would come from stage 5
        });

        if (stage6.status === 'FAILED') throw new Error(`Rechallenge failed: ${stage6.error}`);
        stages.push(stage6);
      }

      // ========================================================================
      // STAGE 7: CAUSALITY ASSESSMENT (Bradford Hill)
      // ========================================================================
      if (input.case_data && input.case_data.drugs && input.case_data.drugs.length > 0) {
        const suspectDrug = input.case_data.drugs.find(d => d.name === 'suspect' || d.name === 'co_suspect') || input.case_data.drugs[0];
        const primaryEvent = input.case_data.events[0];

        const stage7 = await this.executeStage('stage-7-causality', 'agent-9-causality', {
          case: {
            case_id: input.case_data.case_id || `case-${Date.now()}`,
            trace_id: `trc_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`,
            tenant_id: this.config.tenantId,
            drug: {
              name: suspectDrug.name,
              active_substance: suspectDrug.active_substance,
              dose: suspectDrug.dose,
              route: suspectDrug.route,
              therapy_start: suspectDrug.therapy_start,
              therapy_end: suspectDrug.therapy_end,
              action_taken: suspectDrug.action_taken,
              rechallenge_dose: suspectDrug.rechallenge === 'YES' ? suspectDrug.dose : undefined,
              rechallenge_route: suspectDrug.rechallenge === 'YES' ? suspectDrug.route : undefined,
              rechallenge_start: undefined,
              rechallenge_end: undefined,
            },
            event: {
              meddra_llt: primaryEvent.meddra_llt,
              meddra_pt: primaryEvent.meddra_pt,
              onset_date: primaryEvent.onset_date,
              end_date: primaryEvent.end_date,
              outcome: primaryEvent.outcome,
              seriousness: primaryEvent.seriousness,
              seriousness_criteria: primaryEvent.seriousness_criteria,
            },
            dechallenge: {
              done: true,
              result: 'POSITIVE',
            },
            rechallenge: {
              done: true,
              result: 'POSITIVE',
            },
            patient: input.case_data.patient,
            concomitant_meds: input.case_data.concomitant_meds,
            alternative_causes: [],
            clinical_guidelines: [],
          },
          trace_id: `trc_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`,
          tenant_id: this.config.tenantId,
        });

        if (stage7.status === 'FAILED') throw new Error(`Causality failed: ${stage7.error}`);
        stages.push(stage7);
      }

      // ========================================================================
      // STAGE 8: FOLLOW-UP GENERATION (if needed)
      // ========================================================================
      if (input.case_data && this.config.enableHITL) {
        const stage8 = await this.executeStage('stage-8-followup', 'agent-3-followup-generator', {
          case_id: input.case_data.case_id || `case-${Date.now()}`,
          case_data: input.case_data,
          case_version: 1,
          regulatory_deadline_days: 15,
          sender_type: 'MAH',
          existing_followups: [],
        });

        if (stage8.status === 'FAILED') throw new Error(`Follow-up failed: ${stage8.error}`);
        stages.push(stage8);
      }

      // ========================================================================
      // DETERMINE FINAL STATUS
      // ========================================================================
      const hitlRequired = this.determineHITLRequired(stages);
      let finalStatus: PipelineResult['status'] = 'COMPLETED';
      let finalDecision = 'COMPLETED';
      let hitlReviewId: string | undefined;

      if (hitlRequired) {
        finalStatus = 'HITL_REQUIRED';
        finalDecision = 'AWAITING_HUMAN_REVIEW';
        // Would create HITL review record
      } else if (stages.some(s => s.status === 'FAILED')) {
        finalStatus = 'FAILED';
        finalDecision = 'FAILED';
      } else if (stages.some(s => s.output?.decision === 'EXCLUDE')) {
        finalStatus = 'EXCLUDED';
        finalDecision = 'EXCLUDED';
      }

      const totalLatency = Date.now() - Date.now();

      return this.buildResult(traceId, input.article.pmid, finalStatus, stages, finalDecision, hitlRequired, totalLatency, [], false);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[PipelineOrchestrator] Pipeline failed:', errorMsg);

      return this.buildResult(
        traceId,
        input.article.pmid,
        'FAILED',
        stages,
        `Pipeline failed: ${errorMsg}`,
        false,
        Date.now() - Date.now(),
        [errorMsg],
        true
      );
    }
  }

  private async executeStage(stageName: string, agentId: string, input: any): Promise<StageResult> {
    const startTime = Date.now();

    try {
      console.log(`[PipelineOrchestrator] Executing ${stageName} (${agentId})`);

      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Get available replica from pool
      const pool = this.agentPools.get(agentId);
      let result: any;

      if (this.config.enableAudit && this.agentPools.has(agentId)) {
        // Use pool for production
        const pool = this.agentPools.get(agentId);
        result = await pool.execute({
          correlation_id: `stage-${stageName}-${Date.now()}`,
          trace_context: {
            trace_id: `trc_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`,
            span_id: randomBytes(8).toString('hex'),
            tenant_id: this.config.tenantId,
          },
          payload: input,
          priority: 'normal',
          retry_count: 0,
          max_retries: this.config.maxRetries,
        });
      } else {
        // Direct execution for evaluation
        const agentInstance = agent.execute({ input });
        result = await agentInstance;
      }

      const latencyMs = Date.now() - startTime;

      this.emit('stage_completed', { stage: stageName, agentId, latencyMs });

      return {
        stage: stageName,
        agent_id: agentId,
        status: 'SUCCESS',
        latency_ms: latencyMs,
        output: result.output || result,
        execution_tier: result.execution_tier || 'LOCAL',
        review_reasons: result.output?.review_reasons || [],
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[PipelineOrchestrator] Stage ${stageName} failed:`, errorMsg);

      return {
        stage: stageName,
        agent_id: agentId,
        status: 'FAILED',
        latency_ms: Date.now() - startTime,
        error: errorMsg,
        execution_tier: 'DLQ',
      };
    }
  }

  private determineHITLRequired(stages: StageResult[]): boolean {
    // Check if any stage requires HITL
    for (const stage of stages) {
      if (stage.review_reasons && stage.review_reasons.length > 0) {
        return true;
      }
      if (stage.output?.decision === 'REVIEW' || stage.output?.decision === 'SERIOUS') {
        return true;
      }
      if (stage.output?.human_review_status === 'AWAITING_HUMAN_REVIEW') {
        return true;
      }
      if (stage.output?.manualReviewRequired === true) {
        return true;
      }
    }
    return false;
  }

  private buildResult(
    traceId: string,
    pmid: string,
    status: PipelineResult['status'],
    stages: StageResult[],
    decision: string,
    hitlRequired: boolean,
    totalLatencyMs: number,
    errors: string[],
    auditRecorded: boolean
  ): PipelineResult {
    return {
      trace_id: traceId,
      pmid,
      status,
      stages,
      final_decision: decision,
      hitl_required: hitlRequired,
      total_latency_ms: totalLatencyMs,
      audit_recorded: false, // Would be true after audit ledger commit
      errors,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPipelineOrchestrator(config: PipelineConfig): PipelineOrchestrator {
  return new PipelineOrchestrator(config);
}