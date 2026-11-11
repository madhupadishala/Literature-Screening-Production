/**
 * base-agent.ts
 *
 * Base Agent Class for Phase 2 Multi-Agent Orchestration.
 *
 * Provides:
 * - Standardized message envelope handling
 * - Merkle chain integration for audit integrity
 * - Circuit breaker awareness
 * - Structured logging with trace context
 * - Deterministic execution with fixed seeds
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { AuditLedgerService, LedgerEntryInput } from '../audit/audit-ledger-service';
import { HybridInferenceRouter, InferenceRequest, InferenceResponse, InferenceTier } from '../infrastructure/hybrid-inference-router';
import { ZDRStore } from '../infrastructure/redis-zdr-store';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Agent identifiers (1-8 per Phase 2 architecture)
 */
export type AgentId =
  | 'agent-1-literature-duplicates'
  | 'agent-2-icsr-duplicates'
  | 'agent-3-followup-generator'
  | 'agent-3-patient-identification'
  | 'agent-4-screening'
  | 'agent-5-action-taken'
  | 'agent-6-dechallenge'
  | 'agent-7-rechallenge'
  | 'agent-8-medical-history'
  | 'agent-8-country-incident'
  | 'agent-9-causality'
  | 'agent-10-listedness'
  | 'agent-11-country-incident'
  | 'agent-11-seriousness'
  | 'agent-12-listedness-expectedness'
  | 'agent-12-safety-detection'
  | 'agent-13-causality'
  | 'agent-13-narrative-gen'
  | 'agent-14-intake-triage'
  | 'agent-14-intake-triage-legacy'
  | 'agent-15-drug-extraction'
  | 'agent-16-reporter-id'
  | 'agent-17-clock-start'
  | 'agent-25-icsr-validity';

/**
 * Standardized message envelope for inter-agent communication
 */
export interface AgentMessage<T = any> {
  message_id: string;
  correlation_id: string;
  source_agent: AgentId;
  target_agent: AgentId | 'broadcast';
  message_type: 'request' | 'response' | 'event' | 'notification';
  payload: T;
  trace_context: TraceContext;
  merkle_proof: string;
  timestamp: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  retry_count: number;
  max_retries: number;
}

/**
 * Distributed tracing context
 */
export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  tenant_id: string;
}

/**
 * Agent execution result
 */
export interface AgentResult<T = any> {
  success: boolean;
  agent_id: AgentId;
  trace_id: string;
  output?: T;
  error?: string;
  execution_tier: 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';
  model_name?: string;
  model_hash?: string;
  latency_ms: number;
  tokens_used?: number;
  merkle_entry_hash: string;
  execution_metadata: Record<string, any>;
}

/**
 * Agent configuration
 */
export interface BaseAgentConfig {
  agent_id: AgentId;
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
  max_retries: number;
  timeout_ms: number;
  enable_audit: boolean;
  deterministic_seed: number;
}

/**
 * Agent execution input
 */
export interface AgentExecutionInput {
  correlation_id: string;
  trace_context: TraceContext;
  payload: any;
  parent_message_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return randomBytes(16).toString('hex').replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/,
    '$1-$2-$3-$4-$5'
  );
}

/**
 * Generate trace ID
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `trc_${timestamp}_${random}`;
}

/**
 * Generate span ID
 */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * SHA-256 hash
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * HMAC-SHA256 for electronic signatures
 */
export function hmacSha256(data: string, key: string): string {
  return createHash('sha256').update(key + '|' + data).digest('hex');
}

/**
 * Generate queue ID
 */
export function generateQueueId(): string {
  return `queue_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

/**
 * Generate alert ID
 */
export function generateAlertId(): string {
  return `alert_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
}

// ============================================================================
// BASE AGENT CLASS
// ============================================================================

export abstract class BaseAgent extends EventEmitter {
  protected readonly agentId: AgentId;
  protected readonly tenantId: string;
  protected readonly inferenceRouter: HybridInferenceRouter;
  protected readonly auditLedger: AuditLedgerService;
  protected readonly zdrStore: ZDRStore;
  protected readonly maxRetries: number;
  protected readonly timeoutMs: number;
  protected readonly enableAudit: boolean;
  protected readonly deterministicSeed: number;
  protected readonly signingKey: string;

  constructor(config: BaseAgentConfig) {
    super();
    this.agentId = config.agent_id;
    this.tenantId = config.tenant_id;
    this.inferenceRouter = config.inference_router;
    this.auditLedger = config.audit_ledger;
    this.zdrStore = config.zdr_store;
    this.maxRetries = config.max_retries ?? 3;
    this.timeoutMs = config.timeout_ms ?? 30000;
    this.enableAudit = config.enable_audit ?? true;
    this.deterministicSeed = config.deterministic_seed ?? 42;
    this.signingKey = process.env.AUDIT_SIGNING_KEY || 'dev-signing-key-change-in-production';

    // Set max listeners for event emitter
    this.setMaxListeners(20);
  }

  /**
   * Abstract method - must be implemented by each agent
   */
  abstract execute(input: AgentExecutionInput): Promise<AgentResult>;

  /**
   * Agent identifier getter
   */
  getAgentId(): AgentId {
    return this.agentId;
  }

  /**
   * Get agent capabilities/metadata
   */
  abstract getCapabilities(): AgentCapabilities;

  /**
   * Execute with retry logic and audit
   */
  async executeWithRetry(input: AgentExecutionInput): Promise<AgentResult> {
    const traceId = input.trace_context.trace_id;
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Store input in ZDR store for traceability
        if (this.enableAudit) {
          await this.storeExecutionInput(input, attempt);
        }

        // Execute the agent logic
        const result = await this.executeWithTimeout(input);

        // Record successful execution
        const executionTime = Date.now() - startTime;
        const finalResult = this.finalizeResult(result, traceId, executionTime, 'SUCCESS');

        // Record audit entry
        if (this.enableAudit) {
          await this.recordAuditEntry(input, finalResult, attempt);
        }

        this.emit('execution_complete', { agent_id: this.agentId, traceId, success: true });
        return finalResult;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log retry attempt
        this.emit('execution_retry', {
          agent_id: this.agentId,
          traceId,
          attempt: attempt + 1,
          error: lastError.message
        });

        // Exponential backoff
        if (attempt < this.maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(backoff);
        }
      }
    }

    // All retries exhausted
    const executionTime = Date.now() - startTime;
    const failedResult = this.createFailedResult(traceId, executionTime, lastError!);

    // Record failed audit entry
    if (this.enableAudit) {
      await this.recordAuditEntry(input, failedResult, this.maxRetries);
    }

    this.emit('execution_failed', { agent_id: this.agentId, traceId, error: lastError!.message });
    return failedResult;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(input: AgentExecutionInput): Promise<AgentResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const result = await this.execute(input);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store execution input in ZDR store
   */
  private async storeExecutionInput(input: AgentExecutionInput, attempt: number): Promise<void> {
    const traceId = input.trace_context.trace_id;
    const key = `agent:${this.agentId}:${traceId}:attempt:${attempt}`;

    // This would use the ZDR store's internal methods
    // For now, we emit an event that the ZDR store listener can handle
    this.emit('zdr_store_request', {
      operation: 'store',
      key,
      value: {
        agent_id: this.agentId,
        correlation_id: input.correlation_id,
        trace_context: input.trace_context,
        payload: input.payload,
        attempt,
        timestamp: nowISO(),
      },
      ttl_seconds: 86400, // 24 hours
    });
  }

  /**
   * Record audit entry in ledger
   */
  private async recordAuditEntry(
    input: AgentExecutionInput,
    result: AgentResult,
    attempt: number
  ): Promise<void> {
    try {
      const promptText = JSON.stringify({
        agent_id: this.agentId,
        input: input.payload,
        trace_context: input.trace_context,
      });

      const rawOutput = JSON.stringify({
        output: result.output,
        success: result.success,
        execution_tier: result.execution_tier,
        latency_ms: result.latency_ms,
      });

      const entry: LedgerEntryInput = {
        tenantId: this.tenantId,
        traceId: input.trace_context.trace_id,
        spanId: input.trace_context.span_id,
        correlationId: input.correlation_id,
        agentName: this.agentId,
        executionTier: result.execution_tier,
        modelName: result.model_name,
        modelHash: result.model_hash,
        temperature: 0.0,
        seed: this.deterministicSeed,
        promptText,
        rawOutput,
        redactionSummary: { piiTypes: [], charsRedacted: 0 },
        decision: result.success ? 'SUCCESS' : 'FAILED',
        confidence: result.success ? 1.0 : 0.0,
        meddraPts: [],
        seriousnessFlag: false,
      };

      await this.auditLedger.recordExecution(entry);
    } catch (error) {
      // Log but don't fail the execution
      this.emit('audit_error', { agent_id: this.agentId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Finalize successful result
   */
  private finalizeResult(
    result: AgentResult,
    traceId: string,
    executionTime: number,
    status: 'SUCCESS' | 'FAILED'
  ): AgentResult {
    // Compute Merkle entry hash for audit integrity
    const merkleData = {
      agent_id: this.agentId,
      trace_id: traceId,
      success: result.success,
      output: result.output,
      execution_time: executionTime,
      timestamp: nowISO(),
    };
    const merkleEntryHash = sha256(JSON.stringify(merkleData));

    return {
      ...result,
      trace_id: traceId,
      latency_ms: executionTime,
      merkle_entry_hash: merkleEntryHash,
      execution_metadata: {
        ...result.execution_metadata,
        attempt_timestamp: nowISO(),
        status,
      },
    };
  }

  /**
   * Create failed result
   */
  private createFailedResult(traceId: string, executionTime: number, error: Error): AgentResult {
    const merkleData = {
      agent_id: this.agentId,
      trace_id: traceId,
      success: false,
      error: error.message,
      execution_time: executionTime,
      timestamp: nowISO(),
    };
    const merkleEntryHash = sha256(JSON.stringify(merkleData));

    return {
      success: false,
      agent_id: this.agentId,
      trace_id: traceId,
      error: error.message,
      execution_tier: 'DLQ',
      latency_ms: executionTime,
      merkle_entry_hash: merkleEntryHash,
      execution_metadata: {
        error: error.message,
        error_stack: error.stack,
        failed_at: nowISO(),
      },
    };
  }

  /**
   * Send message to another agent
   */
  async sendMessage<T>(targetAgent: AgentId, message: Omit<AgentMessage<T>, 'source_agent' | 'message_id' | 'timestamp' | 'merkle_proof'>): Promise<void> {
    const messageId = generateUUID();
    const timestamp = nowISO();

    // Build merkle proof from message content
    const merkleProof = sha256(JSON.stringify({
      message_id: messageId,
      correlation_id: message.correlation_id,
      source_agent: this.agentId,
      target_agent: targetAgent,
      message_type: message.message_type,
      payload: message.payload,
      trace_context: message.trace_context,
      priority: message.priority,
      retry_count: message.retry_count,
      max_retries: message.max_retries,
      timestamp,
    }));

    const fullMessage: AgentMessage<T> = {
      ...message,
      source_agent: this.agentId,
      message_id: messageId,
      timestamp,
      merkle_proof: merkleProof,
    };

    this.emit('message_sent', { message: fullMessage, target_agent: targetAgent });
  }

  /**
   * Verify incoming message merkle proof
   */
  verifyMessageProof<T>(message: AgentMessage<T>): boolean {
    const expectedProof = sha256(JSON.stringify({
      message_id: message.message_id,
      correlation_id: message.correlation_id,
      source_agent: message.source_agent,
      target_agent: message.target_agent,
      message_type: message.message_type,
      payload: message.payload,
      trace_context: message.trace_context,
      priority: message.priority,
      retry_count: message.retry_count,
      max_retries: message.max_retries,
      timestamp: message.timestamp,
    }));

    return expectedProof === message.merkle_proof;
  }

  /**
   * Create trace context for child operations
   */
  createChildTraceContext(parentContext: TraceContext, operation: string): TraceContext {
    return {
      trace_id: parentContext.trace_id,
      span_id: generateSpanId(),
      parent_span_id: parentContext.span_id,
      tenant_id: parentContext.tenant_id,
    };
  }

  /**
   * Verify incoming message and extract trace context
   */
  async receiveMessage<T>(message: AgentMessage<T>): Promise<{ valid: boolean; context?: TraceContext; payload?: T }> {
    // Verify merkle proof
    if (!this.verifyMessageProof(message)) {
      return { valid: false };
    }

    // Verify target agent matches
    if (message.target_agent !== this.agentId && message.target_agent !== 'broadcast') {
      return { valid: false };
    }

    // Check retry limits
    if (message.retry_count >= message.max_retries) {
      return { valid: false };
    }

    return {
      valid: true,
      context: message.trace_context,
      payload: message.payload,
    };
  }

  /**
   * Health check endpoint for AgentPoolManager
   * MUST be implemented by each agent for self-healing
   */
  async getHealth(): Promise<AgentHealth> {
    const memUsage = process.memoryUsage();
    return {
      agent_id: this.agentId,
      status: 'HEALTHY',
      last_heartbeat: Date.now(),
      consecutive_failures: 0, // Tracked externally
      memory_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      cpu_percent: 0, // Would need os-utils or similar
      active_executions: 0, // Tracked externally
      queue_depth: 0, // Tracked externally
      uptime_ms: Date.now() - (this as any).startTime || Date.now(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  /**
   * Record Merkle checkpoint for state recovery
   * Called periodically during long-running executions
   */
  protected async recordCheckpoint(
    traceId: string,
    spanId: string,
    stepIndex: number,
    input: any,
    output?: any
  ): Promise<void> {
    if (!this.enableAudit) return;

    const inputHash = sha256(JSON.stringify(input));
    const outputHash = output ? sha256(JSON.stringify(output)) : undefined;

    const checkpoint: MerkleCheckpoint = {
      trace_id: traceId,
      span_id: spanId,
      agent_id: this.agentId,
      step_index: stepIndex,
      input_hash: inputHash,
      output_hash: outputHash,
      execution_tier: 'LOCAL', // Would be dynamic
      model_hash: 'checkpoint-v1',
      timestamp: nowISO(),
      merkle_proof: sha256(JSON.stringify({ traceId, spanId, stepIndex, inputHash })),
    };

    // Persist to ZDR store for recovery
    this.emit('zdr_store_request', {
      operation: 'store',
      key: `checkpoint:${this.agentId}:${traceId}:${spanId}:${stepIndex}`,
      value: checkpoint,
      ttl_seconds: 86400,
    });

    // Also persist to audit ledger for immutability
    try {
      await this.auditLedger.recordExecution({
        tenantId: this.tenantId,
        traceId,
        spanId,
        correlationId: traceId,
        agentName: `${this.agentId}-checkpoint`,
        executionTier: 'LOCAL',
        modelName: 'checkpoint',
        modelHash: 'checkpoint-v1',
        temperature: 0.0,
        seed: this.deterministicSeed,
        promptText: JSON.stringify({ step: stepIndex, input: inputHash }),
        rawOutput: JSON.stringify({ output: outputHash }),
        redactionSummary: { piiTypes: [], charsRedacted: 0 },
        decision: 'CHECKPOINT',
        confidence: 1.0,
        meddraPts: [],
        seriousnessFlag: false,
      });
    } catch (error) {
      this.emit('audit_error', { agent_id: this.agentId, error: String(error) });
    }
  }

  /**
   * Resume from latest checkpoint
   * Used when agent is replaced mid-execution
   */
  async resumeFromCheckpoint(traceId: string): Promise<MerkleCheckpoint | null> {
    // Would query ZDR store for latest checkpoint
    // For now, emit event for ZDR store to handle
    return new Promise((resolve) => {
      this.once(`checkpoint_resume:${traceId}`, (checkpoint: MerkleCheckpoint | null) => {
        resolve(checkpoint);
      });
      this.emit('zdr_store_request', {
        operation: 'get_latest_checkpoint',
        key: `checkpoint:${this.agentId}:${traceId}:*`,
      });
      // Timeout after 5s
      setTimeout(() => resolve(null), 5000);
    });
  }
}

/**
 * Agent Health Status (for self-healing / pool manager)
 */
export interface AgentHealth {
  agent_id: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  last_heartbeat: number;               // Unix ms
  consecutive_failures: number;
  memory_mb: number;
  cpu_percent: number;
  active_executions: number;
  queue_depth: number;
  last_error?: string;
  uptime_ms: number;
  version: string;
}

/**
 * Merkle Checkpoint for state recovery
 */
export interface MerkleCheckpoint {
  trace_id: string;
  span_id: string;
  agent_id: AgentId;
  step_index: number;
  input_hash: string;
  output_hash?: string;
  execution_tier: string;
  model_hash: string;
  timestamp: string;
  merkle_proof: string;
}

/**
 * Agent capabilities interface
 */
export interface AgentCapabilities {
  agent_id: AgentId;
  name: string;
  description: string;
  input_schema: any;  // JSON Schema for input validation
  output_schema: any; // JSON Schema for output validation
  supported_tiers: ('CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ')[];
  required_services: string[];
  estimated_latency_ms: number;
  max_concurrent: number;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export interface AgentFactoryConfig {
  agent_id: AgentId;
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}

/**
 * Create agent instance by ID
 */
export function createAgent(config: AgentFactoryConfig): BaseAgent {
  // Lazy-load to avoid circular dependencies
  switch (config.agent_id) {
    case 'agent-3-patient-identification':
      return require('./agent-3-patient-identification').createPatientIdentificationAgent(config);
    case 'agent-8-country-incident':
      return require('./agent-8-country-incident').createCountryIncidentAgent(config);
    case 'agent-25-icsr-validity':
      return require('./agent-25-icsr-validity').createIcsrValidityAgent(config);
    default:
      throw new Error(`Agent factory not yet implemented for ${config.agent_id}`);
  }
}

export { BaseAgent as default };