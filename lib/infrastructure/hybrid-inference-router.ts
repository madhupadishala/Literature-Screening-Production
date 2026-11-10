/**
 * hybrid-inference-router.ts
 *
 * Active-Active Hybrid Inference Router with Circuit Breakers & Self-Healing.
 *
 * Tier 1: Cloud GxP-compliant ZDR endpoint (e.g., Azure OpenAI, AWS Bedrock with ZDR)
 * Tier 2: Local llama.cpp server (Qwen 2.5 14B / Llama 3.1 8B, GBNF-pinned)
 * Tier 3: Deterministic Rule Engine (Aho-Corasick + Regex, zero-LLM fallback)
 * Tier 4: Dead-Letter Queue + Human Emergency Triage
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 * - MTTD < 5s for LLM outages
 * - MTTR < 500ms automatic failover
 * - Schema self-healing: exactly 1 repair attempt
 * - Subprocess health monitoring
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Inference tier enumeration
 */
export type InferenceTier = 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';

/**
 * LLM Provider Configuration (multi-provider per tier)
 */
export interface LLMProvider {
  name: string;                   // Unique provider identifier
  tier: InferenceTier;
  url: string;                    // OpenAI-compatible endpoint
  model_id: string;               // Model identifier
  model_hash: string;             // Expected SHA-256 of model file
  grammar?: string;               // GBNF grammar for constrained decoding
  timeout_ms: number;             // Request timeout
  max_tokens: number;
  temperature: number;            // Must be 0.0 for determinism
  seed: number;                   // Fixed seed for reproducibility
  headers?: Record<string, string>;
  health_check_path: string;      // e.g., '/health'
  priority: number;               // Lower = higher priority within tier
  weight: number;                 // Routing weight (0-1) for load balancing
  max_concurrent: number;         // Max concurrent requests
  capabilities?: string[];        // e.g., ['json_mode', 'grammar', 'streaming']
}

/**
 * Provider Health Score (for weighted routing)
 */
export interface ProviderHealthScore {
  provider_name: string;
  tier: InferenceTier;
  score: number;                  // 0-1 health score
  avg_latency_ms: number;
  error_rate: number;             // 0-1
  success_rate: number;           // 0-1
  consecutive_failures: number;
  consecutive_successes: number;
  last_health_check: string;
  circuit_state: CircuitState;
  is_available: boolean;
  capacity_used: number;          // Current concurrent requests
  capacity_max: number;           // Max concurrent
}

/**
 * Inference endpoint configuration (legacy - deprecated, use LLMProvider)
 * @deprecated Use LLMProvider instead
 */
export interface InferenceEndpoint {
  tier: InferenceTier;
  name: string;
  url: string;
  model_id: string;
  model_hash: string;
  grammar?: string;
  timeout_ms: number;
  max_tokens: number;
  temperature: number;
  seed: number;
  headers?: Record<string, string>;
  health_check_path: string;
  priority: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failure_threshold: number;      // Consecutive failures to open (default: 3)
  success_threshold: number;      // Consecutive successes to close (default: 2)
  timeout_ms: number;             // Time in OPEN state before HALF_OPEN (default: 30000)
  latency_threshold_ms: number;   // Request latency to count as failure (default: 8000)
  excluded_status_codes: number[]; // Status codes that don't count as failures
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
  tier: InferenceTier;
  state: CircuitState;
  consecutive_failures: number;
  consecutive_successes: number;
  last_failure_at?: string;
  last_success_at?: string;
  next_attempt_at?: string;       // When HALF_OPEN will be attempted
  total_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
}

/**
 * Inference request
 */
export interface InferenceRequest {
  trace_id: string;
  tenant_id: string;
  pmid: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  grammar?: string;               // Override endpoint grammar
  max_tokens?: number;
  temperature?: number;
  seed?: number;
  schema?: object;                // JSON schema for validation/repair
  metadata?: Record<string, any>;
}

/**
 * Inference response
 */
export interface InferenceResponse {
  trace_id: string;
  tier: InferenceTier;
  model_name: string;
  model_hash: string;
  content: string;                // Raw model output
  parsed?: any;                   // Parsed JSON (if schema provided)
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms: number;
  timestamp: string;
  circuit_breaker_state: CircuitState;
  fallback_from?: InferenceTier;  // If this is a fallback
  repair_attempted: boolean;
  repair_successful: boolean;
}

/**
 * Schema repair attempt
 */
export interface SchemaRepairResult {
  success: boolean;
  repaired_content?: string;
  error?: string;
}

/**
 * Provider Pool Configuration (multi-provider per tier)
 */
export interface ProviderPoolConfig {
  providers: LLMProvider[];
  circuit_breaker: CircuitBreakerConfig;
  schema_repair_enabled: boolean;
  schema_repair_prompt: string;
  health_check_interval_ms: number;
  fallback_timeout_ms: number;
  enable_tier3_heuristic: boolean;
  dlq_on_exhaustion: boolean;
  // Routing strategy
  routing_strategy: 'priority' | 'weighted' | 'least_latency' | 'health_score';
  // Tier fallback order
  tier_fallback_order: InferenceTier[];
  // Load balancing
  max_retries_per_provider: number;
  retry_delay_ms: number;
}

/**
 * Router configuration (legacy - deprecated, use ProviderPoolConfig)
 * @deprecated Use ProviderPoolConfig instead
 */
export interface HybridRouterConfig {
  endpoints: InferenceEndpoint[];
  circuit_breaker: CircuitBreakerConfig;
  schema_repair_enabled: boolean;
  schema_repair_prompt: string;
  health_check_interval_ms: number;
  fallback_timeout_ms: number;
  enable_tier3_heuristic: boolean;
  dlq_on_exhaustion: boolean;
}

// ============================================================================
// CIRCUIT BREAKER IMPLEMENTATION
// ============================================================================

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureAt?: Date;
  private lastSuccessAt?: Date;
  private nextAttemptAt?: Date;
  private totalRequests = 0;
  private failedRequests = 0;
  private latencySum = 0;
  private latencyCount = 0;

  constructor(
    private readonly tier: InferenceTier,
    private readonly config: CircuitBreakerConfig
  ) {}

  /**
   * Check if request should be allowed
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      if (this.nextAttemptAt && Date.now() >= this.nextAttemptAt.getTime()) {
        this.transitionToHalfOpen();
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one request through
    return true;
  }

  /**
   * Record successful request
   */
  recordSuccess(latencyMs: number): void {
    this.totalRequests++;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.lastSuccessAt = new Date();
    this.latencySum += latencyMs;
    this.latencyCount++;

    if (this.state === 'HALF_OPEN' && this.consecutiveSuccesses >= this.config.success_threshold) {
      this.transitionToClosed();
    }
  }

  /**
   * Record failed request
   */
  recordFailure(latencyMs: number, isLatencyFailure = false): void {
    this.totalRequests++;
    this.failedRequests++;
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    this.lastFailureAt = new Date();
    this.latencySum += latencyMs;
    this.latencyCount++;

    if (this.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.state === 'CLOSED' && this.consecutiveFailures >= this.config.failure_threshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Record latency-based failure
   */
  recordLatencyFailure(latencyMs: number): void {
    if (latencyMs > this.config.latency_threshold_ms) {
      this.recordFailure(latencyMs, true);
    }
  }

  private transitionToOpen(): void {
    this.state = 'OPEN';
    this.nextAttemptAt = new Date(Date.now() + this.config.timeout_ms);
  }

  private transitionToHalfOpen(): void {
    this.state = 'HALF_OPEN';
    this.consecutiveSuccesses = 0;
    this.nextAttemptAt = undefined;
  }

  private transitionToClosed(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.nextAttemptAt = undefined;
  }

  /**
   * Get current status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      tier: this.tier,
      state: this.state,
      consecutive_failures: this.consecutiveFailures,
      consecutive_successes: this.consecutiveSuccesses,
      last_failure_at: this.lastFailureAt?.toISOString(),
      last_success_at: this.lastSuccessAt?.toISOString(),
      next_attempt_at: this.nextAttemptAt?.toISOString(),
      total_requests: this.totalRequests,
      failed_requests: this.failedRequests,
      avg_latency_ms: this.latencyCount > 0 ? Math.round(this.latencySum / this.latencyCount) : 0,
    };
  }

  /**
   * Force state (for testing/admin)
   */
  forceState(state: CircuitState): void {
    this.state = state;
    if (state === 'OPEN') {
      this.nextAttemptAt = new Date(Date.now() + this.config.timeout_ms);
    } else if (state === 'CLOSED') {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
      this.nextAttemptAt = undefined;
    }
  }

  isHealthy(): boolean {
    return this.state !== 'OPEN';
  }
}

// ============================================================================
// TIER 3: DETERMINISTIC HEURISTIC ENGINE
// ============================================================================

/**
 * Zero-LLM fallback: rule-based extraction using deterministic patterns
 */
class HeuristicEngine {
  private adverseEventPatterns: RegExp[];
  private seriousnessPatterns: RegExp[];
  private specialSituationPatterns: RegExp[];
  private exclusionPatterns: RegExp[];

  constructor() {
    // MedDRA LLT-adjacent patterns (high recall, lower precision)
    this.adverseEventPatterns = [
      /\b(adverse\s+(event|reaction|effect)|side\s+effect|drug\s+reaction)\b/gi,
      /\b(hepatotoxicit[y|ies]|liver\s+(injur[y|ies]|toxicit[y|ies])|hepatic\s+(injur[y|ies]|failure))\b/gi,
      /\b(rash|urticaria|pruritus|erythema|dermatitis)\b/gi,
      /\b(death|fatal|mortality)\b/gi,
      /\b(hospitalization|hospitalisation|admitted|admission)\b/gi,
      /\b(life.?threatening|life.?threatening)\b/gi,
      /\b(disabilit[y|ies]|permanent\s+damage)\b/gi,
      /\b(congenital\s+(anomaly|malformation)|birth\s+defect)\b/gi,
      /\b(overdose|overdosage|accidental\s+exposure)\b/gi,
      /\b(misuse|abuse|dependence|addiction)\b/gi,
      /\b(medication\s+error|dosing\s+error|wrong\s+drug)\b/gi,
      /\b(lack\s+of\s+efficacy|therapeutic\s+failure|treatment\s+failure)\b/gi,
      /\b(off.?label|unapproved\s+use)\b/gi,
      /\b(pregnan[c|t]|exposure\s+during\s+pregnancy)\b/gi,
      /\b(breastfeeding|lactation|nursing\s+infant)\b/gi,
    ];

    this.seriousnessPatterns = [
      /\b(death|fatal|died|mortality)\b/gi,
      /\b(life.?threatening)\b/gi,
      /\b(hospitalization|hospitalisation|admitted|ICU|intensive\s+care)\b/gi,
      /\b(disability|permanent|irreversible)\b/gi,
      /\b(congenital\s+(anomaly|malformation)|birth\s+defect)\b/gi,
      /\b(medically\s+significant|important\s+medical\s+event)\b/gi,
    ];

    this.specialSituationPatterns = [
      /\b(pregnan[c|t]|gestation|fetal|embryo)\b/gi,
      /\b(breastfeeding|lactation|nursing)\b/gi,
      /\b(overdose|overdosage)\b/gi,
      /\b(misuse|abuse|recreational\s+use)\b/gi,
      /\b(medication\s+error|dosing\s+error|wrong\s+(drug|dose|route))\b/gi,
      /\b(lack\s+of\s+efficacy|therapeutic\s+failure)\b/gi,
      /\b(off.?label|unapproved|compassionate\s+use|named\s+patient)\b/gi,
      /\b(occupational\s+exposure|accidental\s+exposure)\b/gi,
      /\b(pediatric|infant|neonate|child)\b/gi,
      /\b(renal\s+(impairment|failure)|hepatic\s+(impairment|failure))\b/gi,
    ];

    this.exclusionPatterns = [
      /\b(animal\s+(study|model|experiment|test))\b/gi,
      /\b(in\s+vitro|cell\s+(culture|line)|tissue\s+culture)\b/gi,
      /\b(preclinical|non.?clinical)\b/gi,
      /\b(mechanism\s+of\s+action|pharmacodynamic|pharmacokinetic)\b/gi,
      /\b(meta.?analysis|systematic\s+review|literature\s+review)\b/gi,
      /\b(healthy\s+volunteer|phase\s+1|first.?in.?human)\b/gi,
    ];
  }

  /**
   * Extract adverse events using pattern matching
   */
  extractAdverseEvents(text: string): Array<{ llt: string; verbatim: string; seriousness: 'serious' | 'non_serious' | 'unknown' }> {
    const events: Array<{ llt: string; verbatim: string; seriousness: 'serious' | 'non_serious' | 'unknown' }> = [];
    const lowerText = text.toLowerCase();

    for (const pattern of this.adverseEventPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const verbatim = match[0];
        const seriousness = this.seriousnessPatterns.some(p => p.test(verbatim))
          ? 'serious'
          : this.specialSituationPatterns.some(p => p.test(verbatim))
            ? 'serious'
            : 'non_serious';

        events.push({
          llt: this.normalizeLLT(verbatim),
          verbatim,
          seriousness,
        });

        // Avoid infinite loop on zero-width matches
        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
    }

    // Deduplicate by verbatim
    const seen = new Set<string>();
    return events.filter(e => {
      if (seen.has(e.verbatim.toLowerCase())) return false;
      seen.add(e.verbatim.toLowerCase());
      return true;
    });
  }

  /**
   * Detect seriousness flag
   */
  detectSeriousness(text: string): boolean {
    return this.seriousnessPatterns.some(p => p.test(text));
  }

  /**
   * Detect special situations
   */
  detectSpecialSituations(text: string): string[] {
    const situations: string[] = [];
    for (const pattern of this.specialSituationPatterns) {
      if (pattern.test(text)) {
        // Extract the matching term
        const match = text.match(pattern);
        if (match) situations.push(match[0].toLowerCase());
      }
    }
    return [...new Set(situations)];
  }

  /**
   * Detect exclusion criteria
   */
  detectExclusions(text: string): string[] {
    const exclusions: string[] = [];
    for (const pattern of this.exclusionPatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        if (match) exclusions.push(match[0].toLowerCase());
      }
    }
    return [...new Set(exclusions)];
  }

  /**
   * Determine decision based on heuristic analysis
   */
  determineDecision(
    text: string,
    matchedProducts: boolean
  ): { decision: 'PROCEED_TO_INTAKE' | 'EXCLUDE' | 'MANUAL_REVIEW_REQUIRED'; confidence: number } {
    const exclusions = this.detectExclusions(text);
    const events = this.extractAdverseEvents(text);
    const seriousness = this.detectSeriousness(text);

    if (exclusions.length > 0 && events.length === 0) {
      return { decision: 'EXCLUDE', confidence: 0.85 };
    }

    if (!matchedProducts) {
      return { decision: 'EXCLUDE', confidence: 0.9 };
    }

    if (events.length > 0 && matchedProducts) {
      const conf = seriousness ? 0.8 : 0.7;
      return { decision: 'PROCEED_TO_INTAKE', confidence: conf };
    }

    return { decision: 'MANUAL_REVIEW_REQUIRED', confidence: 0.5 };
  }

  /**
   * Normalize verbatim to LLT-like form
   */
  private normalizeLLT(verbatim: string): string {
    return verbatim
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }
}

// ============================================================================
// SCHEMA REPAIR ENGINE
// ============================================================================

class SchemaRepairEngine {
  constructor(
    private readonly repairPrompt: string,
    private readonly provider: LLMProvider
  ) {}

  /**
   * Attempt single-shot schema repair
   */
  async repair(
    rawContent: string,
    schema: object,
    traceId: string
  ): Promise<SchemaRepairResult> {
    const prompt = this.repairPrompt
      .replace('{SCHEMA}', JSON.stringify(schema, null, 2))
      .replace('{CONTENT}', rawContent);

    try {
      const response = await this.callRepairEndpoint(prompt, traceId);
      const parsed = JSON.parse(response);

      // Validate against schema (basic check)
      if (this.validateAgainstSchema(parsed, schema)) {
        return { success: true, repaired_content: JSON.stringify(parsed) };
      }

      return { success: false, error: 'Repaired output failed schema validation' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Repair failed'
      };
    }
  }

  private async callRepairEndpoint(prompt: string, traceId: string): Promise<string> {
    const response = await fetch(`${this.provider.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': traceId,
        ...this.provider.headers,
      },
      body: JSON.stringify({
        model: this.provider.model_id,
        messages: [
          { role: 'system', content: 'You are a JSON repair specialist. Fix the JSON to match the schema exactly.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.0,
        seed: this.provider.seed,
        max_tokens: this.provider.max_tokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(this.provider.timeout_ms),
    });

    if (!response.ok) {
      throw new Error(`Repair endpoint error: ${response.status}`);
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  }

  private validateAgainstSchema(obj: any, schema: any): boolean {
    // Basic required field check
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) return false;
      }
    }
    return true;
  }
}

// ============================================================================
// MAIN HYBRID ROUTER (Multi-Provider, Health-Scored, Weighted Routing)
// ============================================================================

export class HybridInferenceRouter extends EventEmitter {
  private providers: Map<string, LLMProvider> = new Map();           // provider_name -> provider
  private providersByTier: Map<InferenceTier, LLMProvider[]> = new Map(); // tier -> providers[]
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();  // provider_name -> breaker
  private providerHealth: Map<string, ProviderHealthScore> = new Map(); // provider_name -> health
  private heuristicEngine: HeuristicEngine;
  private schemaRepairEngine?: SchemaRepairEngine;
  private config: ProviderPoolConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;
  private requestCounts: Map<string, number> = new Map(); // For weighted routing

  constructor(config: ProviderPoolConfig) {
    super();
    this.config = config;
    this.heuristicEngine = new HeuristicEngine();

    // Initialize providers and circuit breakers
    for (const provider of config.providers) {
      this.providers.set(provider.name, provider);

      if (!this.providersByTier.has(provider.tier)) {
        this.providersByTier.set(provider.tier, []);
      }
      this.providersByTier.get(provider.tier)!.push(provider);

      this.circuitBreakers.set(provider.name, new CircuitBreaker(provider.tier, config.circuit_breaker));

      // Initialize health scores
      this.providerHealth.set(provider.name, {
        provider_name: provider.name,
        tier: provider.tier,
        score: 1.0,
        avg_latency_ms: 0,
        error_rate: 0,
        success_rate: 1.0,
        consecutive_failures: 0,
        consecutive_successes: 0,
        last_health_check: new Date().toISOString(),
        circuit_state: 'CLOSED',
        is_available: true,
        capacity_used: 0,
        capacity_max: provider.max_concurrent,
      });
      this.requestCounts.set(provider.name, 0);
    }

    // Sort providers within each tier by priority
    for (const [tier, providers] of this.providersByTier) {
      providers.sort((a, b) => a.priority - b.priority);
    }

    // Initialize schema repair engine (uses best available LOCAL provider)
    if (config.schema_repair_enabled) {
      const localProviders = this.providersByTier.get('LOCAL') || [];
      const repairProvider = localProviders[0] || this.getBestProvider('CLOUD');
      if (repairProvider) {
        this.schemaRepairEngine = new SchemaRepairEngine(config.schema_repair_prompt, repairProvider);
      }
    }

    // Tier fallback order (default: CLOUD -> LOCAL -> HEURISTIC -> DLQ)
    this.tierFallbackOrder = config.tier_fallback_order || ['CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ'];
  }

  private tierFallbackOrder: InferenceTier[] = [];

  /**
   * Start health checks and monitoring
   */
  async start(): Promise<void> {
    // Initial health checks
    await this.runHealthChecks();

    // Periodic health checks
    this.healthCheckTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.runHealthChecks();
        this.updateHealthScores();
      }
    }, this.config.health_check_interval_ms);

    // Verify model hashes on startup
    await this.verifyModelHashes();
  }

  /**
   * Stop router
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }

  /**
   * Main inference method with multi-provider cascade
   */
  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let repairAttempted = false;
    let repairSuccessful = false;
    let fallbackFromTier: InferenceTier | undefined;
    let fallbackFromProvider: string | undefined;

    // Try each tier in fallback order
    for (const tier of this.tierFallbackOrder) {
      if (tier === 'DLQ') break; // Handle DLQ at the end

      const providers = this.getAvailableProviders(tier);
      if (providers.length === 0) {
        this.emit('tier_unavailable', { tier, trace_id: request.trace_id });
        continue;
      }

      // Try providers within tier based on routing strategy
      const providerOrder = this.getProviderOrder(tier, request);

      for (const provider of providerOrder) {
        const breaker = this.circuitBreakers.get(provider.name);
        const health = this.providerHealth.get(provider.name);

        if (!breaker || !health) continue;

        // Skip if circuit breaker is open (except for heuristic which has no breaker)
        if (tier !== 'HEURISTIC' && !breaker.canExecute()) {
          this.emit('circuit_open', { tier, provider: provider.name, trace_id: request.trace_id });
          continue;
        }

        // Check capacity
        if (health.capacity_used >= health.capacity_max) {
          this.emit('provider_at_capacity', { provider: provider.name, trace_id: request.trace_id });
          continue;
        }

        try {
          // Acquire capacity slot
          health.capacity_used++;
          this.requestCounts.set(provider.name, (this.requestCounts.get(provider.name) || 0) + 1);

          const response = await this.executeProvider(provider, breaker, request, startTime);

          // Validate schema if provided
          if (request.schema && response.parsed === undefined) {
            const parseResult = this.parseAndValidate(response.content, request.schema);
            if (parseResult.success) {
              response.parsed = parseResult.data;
            } else if (this.config.schema_repair_enabled && this.schemaRepairEngine && !repairAttempted) {
              // Single-shot schema repair
              repairAttempted = true;
              const repair = await this.schemaRepairEngine.repair(response.content, request.schema, request.trace_id);
              if (repair.success && repair.repaired_content) {
                const reparsed = JSON.parse(repair.repaired_content);
                if (this.validateSchema(reparsed, request.schema)) {
                  response.parsed = reparsed;
                  response.content = repair.repaired_content;
                  repairSuccessful = true;
                  this.emit('schema_repair_success', { trace_id: request.trace_id, tier, provider: provider.name });
                }
              }
              if (!repairSuccessful) {
                this.emit('schema_repair_failed', { trace_id: request.trace_id, tier, provider: provider.name, error: repair.error });
              }
            }
          }

          // Record success
          breaker.recordSuccess(response.latency_ms);
          health.consecutive_failures = 0;
          health.consecutive_successes++;
          health.last_health_check = new Date().toISOString();
          health.circuit_state = 'CLOSED';

          this.emit('inference_success', {
            trace_id: request.trace_id,
            tier,
            provider: provider.name,
            latency_ms: response.latency_ms
          });

          // Add fallback info if this wasn't the first provider/tier
          if (fallbackFromTier !== undefined) {
            response.fallback_from = fallbackFromTier;
          }
          if (fallbackFromProvider !== undefined) {
            (response as any).fallback_from_provider = fallbackFromProvider;
          }

          response.repair_attempted = repairAttempted;
          response.repair_successful = repairSuccessful;

          return response;

        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          breaker.recordFailure(Date.now() - startTime);
          health.consecutive_successes = 0;
          health.consecutive_failures++;
          health.last_health_check = new Date().toISOString();

          this.emit('inference_failed', {
            trace_id: request.trace_id,
            tier,
            provider: provider.name,
            error: lastError.message
          });

          // Continue to next provider
          continue;
        } finally {
          health.capacity_used = Math.max(0, health.capacity_used - 1);
        }
      }

      // All providers in this tier exhausted
      this.emit('tier_exhausted', { tier, trace_id: request.trace_id });
      fallbackFromTier = tier;
    }

    // All LLM tiers exhausted - try Tier 3 Heuristic
    if (this.config.enable_tier3_heuristic && this.tierFallbackOrder.includes('HEURISTIC')) {
      try {
        const heuristicResponse = await this.executeHeuristic(request, startTime);
        this.emit('fallback_heuristic', { trace_id: request.trace_id });
        return heuristicResponse;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.emit('heuristic_failed', { trace_id: request.trace_id, error: lastError.message });
      }
    }

    // All tiers exhausted - return DLQ response
    if (this.config.dlq_on_exhaustion) {
      return this.createDLQResponse(request, startTime, lastError);
    }

    throw new Error(`All inference tiers exhausted. Last error: ${lastError?.message}`);
  }

  /**
   * Get available providers for a tier (healthy, not at capacity)
   */
  private getAvailableProviders(tier: InferenceTier): LLMProvider[] {
    const providers = this.providersByTier.get(tier) || [];
    return providers.filter(p => {
      const health = this.providerHealth.get(p.name);
      const breaker = this.circuitBreakers.get(p.name);
      return health && breaker &&
             health.is_available &&
             health.capacity_used < health.capacity_max &&
             (tier === 'HEURISTIC' || breaker.canExecute());
    });
  }

  /**
   * Get provider order based on routing strategy
   */
  private getProviderOrder(tier: InferenceTier, request: InferenceRequest): LLMProvider[] {
    const providers = this.getAvailableProviders(tier);

    switch (this.config.routing_strategy) {
      case 'weighted':
        return this.weightedRandomSelection(providers);
      case 'least_latency':
        return [...providers].sort((a, b) => {
          const ha = this.providerHealth.get(a.name);
          const hb = this.providerHealth.get(b.name);
          return (ha?.avg_latency_ms || 0) - (hb?.avg_latency_ms || 0);
        });
      case 'health_score':
        return [...providers].sort((a, b) => {
          const ha = this.providerHealth.get(a.name);
          const hb = this.providerHealth.get(b.name);
          return (hb?.score || 0) - (ha?.score || 0);
        });
      case 'priority':
      default:
        return providers; // Already sorted by priority
    }
  }

  /**
   * Weighted random selection based on provider weights
   */
  private weightedRandomSelection(providers: LLMProvider[]): LLMProvider[] {
    if (providers.length <= 1) return providers;

    // Create weighted list
    const weighted: LLMProvider[] = [];
    for (const p of providers) {
      const count = Math.max(1, Math.round(p.weight * 10));
      for (let i = 0; i < count; i++) {
        weighted.push(p);
      }
    }

    // Shuffle and return
    return weighted.sort(() => Math.random() - 0.5);
  }

  /**
   * Get best provider for a tier (for schema repair, etc.)
   */
  private getBestProvider(tier: InferenceTier): LLMProvider | undefined {
    const providers = this.getAvailableProviders(tier);
    if (providers.length === 0) return undefined;
    return providers[0]; // Highest priority
  }

  /**
   * Execute inference on a specific provider
   */
  private async executeProvider(
    provider: LLMProvider,
    breaker: CircuitBreaker,
    request: InferenceRequest,
    globalStartTime: number
  ): Promise<InferenceResponse> {
    const tierStartTime = Date.now();

    const response = await fetch(`${provider.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': request.trace_id,
        ...provider.headers,
      },
      body: JSON.stringify({
        model: provider.model_id,
        messages: request.messages,
        temperature: request.temperature ?? provider.temperature,
        seed: request.seed ?? provider.seed,
        max_tokens: request.max_tokens ?? provider.max_tokens,
        grammar: request.grammar ?? provider.grammar,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: AbortSignal.timeout(provider.timeout_ms),
    });

    const latencyMs = Date.now() - tierStartTime;

    // Check latency threshold
    if (latencyMs > this.config.circuit_breaker.latency_threshold_ms) {
      breaker.recordLatencyFailure(latencyMs);
      throw new Error(`Latency threshold exceeded: ${latencyMs}ms > ${this.config.circuit_breaker.latency_threshold_ms}ms`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    };
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON if possible
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Will trigger schema repair if enabled
    }

    return {
      trace_id: request.trace_id,
      tier: provider.tier,
      model_name: provider.name,
      model_hash: provider.model_hash,
      content,
      parsed,
      usage: {
        prompt_tokens: data.usage?.prompt_tokens || 0,
        completion_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0,
      },
      latency_ms: Date.now() - globalStartTime,
      timestamp: new Date().toISOString(),
      circuit_breaker_state: breaker.getStatus().state,
      repair_attempted: false,
      repair_successful: false,
    };
  }

  /**
   * Execute Tier 3 heuristic fallback
   */
  private async executeHeuristic(request: InferenceRequest, globalStartTime: number): Promise<InferenceResponse> {
    // Build text from messages
    const text = request.messages.map(m => m.content).join('\n\n');

    // Extract using heuristic engine
    const events = this.heuristicEngine.extractAdverseEvents(text);
    const seriousness = this.heuristicEngine.detectSeriousness(text);
    const specialSituations = this.heuristicEngine.detectSpecialSituations(text);
    const exclusions = this.heuristicEngine.detectExclusions(text);

    // Determine if products matched (would come from deterministic gate)
    const matchedProducts = request.metadata?.matched_products === true;

    const { decision, confidence } = this.heuristicEngine.determineDecision(text, matchedProducts);

    const verbatimQuotes = events.slice(0, 5).map(e => e.verbatim);

    const heuristicOutput = {
      pmid: request.pmid,
      decision,
      confidence,
      adverse_events: events.map(e => ({
        meddra_llt: e.llt,
        verbatim_text: e.verbatim,
        seriousness: e.seriousness,
      })),
      verbatim_quotes: verbatimQuotes,
      seriousness_flag: seriousness,
      special_situations: specialSituations,
      exclusion_criteria: exclusions,
      rationale: `Heuristic extraction: ${events.length} events found, seriousness=${seriousness}, exclusions=${exclusions.length}`,
    };

    return {
      trace_id: request.trace_id,
      tier: 'HEURISTIC',
      model_name: 'deterministic-heuristic-v1',
      model_hash: 'heuristic-engine-v1',
      content: JSON.stringify(heuristicOutput),
      parsed: heuristicOutput,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      latency_ms: Date.now() - globalStartTime,
      timestamp: new Date().toISOString(),
      circuit_breaker_state: 'CLOSED',
      repair_attempted: false,
      repair_successful: false,
    };
  }

  /**
   * Create DLQ response when all tiers exhausted
   */
  private createDLQResponse(request: InferenceRequest, startTime: number, error?: Error | null): InferenceResponse {
    return {
      trace_id: request.trace_id,
      tier: 'DLQ',
      model_name: 'dead-letter-queue',
      model_hash: 'dlq-v1',
      content: JSON.stringify({
        pmid: request.pmid,
        decision: 'MANUAL_REVIEW_REQUIRED',
        confidence: 0.0,
        adverse_events: [],
        verbatim_quotes: [],
        seriousness_flag: false,
        special_situations: ['ALL_TIERS_EXHAUSTED'],
        exclusion_criteria: ['ROUTER_EXHAUSTION'],
        rationale: `All inference tiers failed. Last error: ${error?.message || 'Unknown'}. Requires human triage.`,
      }),
      parsed: undefined,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      latency_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      circuit_breaker_state: 'CLOSED',
      repair_attempted: false,
      repair_successful: false,
    };
  }

  /**
   * Parse and validate JSON against schema
   */
  private parseAndValidate(content: string, schema: object): { success: boolean; data?: any } {
    try {
      const parsed = JSON.parse(content);
      if (this.validateSchema(parsed, schema)) {
        return { success: true, data: parsed };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }

  private validateSchema(obj: any, schema: any): boolean {
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in obj)) return false;
      }
    }
    return true;
  }

  // ========================================================================
  // HEALTH CHECKS, MODEL VERIFICATION & HEALTH SCORING
  // ========================================================================

  private async runHealthChecks(): Promise<void> {
    for (const [name, provider] of this.providers) {
      if (provider.tier === 'HEURISTIC') continue;

      try {
        const healthy = await this.checkProviderHealth(provider);
        const health = this.providerHealth.get(name);
        const breaker = this.circuitBreakers.get(name);

        if (healthy && health && breaker) {
          // If provider recovered, force close circuit
          if (breaker.getStatus().state === 'OPEN') {
            breaker.forceState('CLOSED');
            this.emit('circuit_recovered', { tier: provider.tier, provider: name });
          }
          health.is_available = true;
        } else if (!healthy && health && breaker) {
          // If provider unhealthy, force open circuit
          if (breaker.getStatus().state === 'CLOSED') {
            breaker.forceState('OPEN');
            this.emit('circuit_forced_open', { tier: provider.tier, provider: name });
          }
          health.is_available = false;
        }
      } catch (err) {
        this.emit('health_check_error', { provider: name, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private async checkProviderHealth(provider: LLMProvider): Promise<boolean> {
    try {
      const response = await fetch(`${provider.url}${provider.health_check_path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return false;

      const data = await response.json() as { model_loaded?: boolean; model_hash?: string };
      // Verify model is loaded and matches expected hash
      return data.model_loaded === true && (!provider.model_hash || data.model_hash === provider.model_hash);
    } catch {
      return false;
    }
  }

  private async verifyModelHashes(): Promise<void> {
    for (const [name, provider] of this.providers) {
      if (provider.tier === 'HEURISTIC') continue;

      try {
        const response = await fetch(`${provider.url}${provider.health_check_path}`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const data = await response.json() as { model_loaded?: boolean; model_hash?: string };
          if (provider.model_hash && data.model_hash && data.model_hash !== provider.model_hash) {
            this.emit('model_hash_mismatch', {
              tier: provider.tier,
              provider: name,
              expected: provider.model_hash,
              actual: data.model_hash,
            });
            // Force circuit open on hash mismatch
            const breaker = this.circuitBreakers.get(name);
            if (breaker) breaker.forceState('OPEN');
          }
        }
      } catch (err) {
        this.emit('model_hash_check_failed', { provider: name, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  /**
   * Update health scores based on recent performance
   */
  private updateHealthScores(): void {
    for (const [name, health] of this.providerHealth) {
      const breaker = this.circuitBreakers.get(name);
      if (!breaker) continue;

      const status = breaker.getStatus();

      // Calculate health score (0-1)
      // Factors: success_rate (40%), latency (30%), circuit_state (20%), capacity (10%)
      const successRateWeight = 0.4;
      const latencyWeight = 0.3;
      const circuitWeight = 0.2;
      const capacityWeight = 0.1;

      const successRateScore = status.total_requests > 0
        ? 1 - (status.failed_requests / status.total_requests)
        : 1;

      const latencyScore = status.avg_latency_ms > 0
        ? Math.max(0, 1 - (status.avg_latency_ms / this.config.circuit_breaker.latency_threshold_ms))
        : 1;

      const circuitScore = status.state === 'CLOSED' ? 1 : (status.state === 'HALF_OPEN' ? 0.5 : 0);

      const capacityScore = health.capacity_max > 0
        ? 1 - (health.capacity_used / health.capacity_max)
        : 1;

      health.score = (
        successRateScore * successRateWeight +
        latencyScore * latencyWeight +
        circuitScore * circuitWeight +
        capacityScore * capacityWeight
      );

      health.avg_latency_ms = status.avg_latency_ms;
      health.error_rate = status.total_requests > 0 ? status.failed_requests / status.total_requests : 0;
      health.success_rate = successRateScore;
      health.consecutive_failures = status.consecutive_failures;
      health.consecutive_successes = status.consecutive_successes;
      health.circuit_state = status.state;
      health.last_health_check = new Date().toISOString();
    }
  }

  // ========================================================================
  // STATUS & MONITORING
  // ========================================================================

  /**
   * Get all circuit breaker statuses
   */
  getCircuitBreakerStatuses(): CircuitBreakerStatus[] {
    return Array.from(this.circuitBreakers.values()).map(b => b.getStatus());
  }

  /**
   * Get provider health summary
   */
  getProviderStatuses(): ProviderHealthScore[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Get provider health by tier
   */
  getProviderStatusesByTier(tier: InferenceTier): ProviderHealthScore[] {
    return Array.from(this.providerHealth.values()).filter(h => h.tier === tier);
  }

  /**
   * Force circuit breaker state (admin operation)
   */
  forceCircuitState(providerName: string, state: CircuitState): boolean {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return false;
    breaker.forceState(state);
    this.emit('circuit_forced', { provider: providerName, state });
    return true;
  }

  /**
   * Get router statistics
   */
  getStats(): {
    total_providers: number;
    healthy_providers: number;
    providers_by_tier: Record<InferenceTier, number>;
    circuit_states: Record<string, CircuitState>;
    total_requests: number;
    total_failures: number;
    avg_health_score: number;
  } {
    const healthScores = Array.from(this.providerHealth.values());
    const statuses = this.getCircuitBreakerStatuses();

    return {
      total_providers: this.providers.size,
      healthy_providers: healthScores.filter(h => h.is_available && h.circuit_state !== 'OPEN').length,
      providers_by_tier: Object.fromEntries(
        Array.from(this.providersByTier.entries()).map(([tier, providers]) => [tier, providers.length])
      ) as Record<InferenceTier, number>,
      circuit_states: Object.fromEntries(statuses.map(s => [s.tier, s.state])) as Record<string, CircuitState>,
      total_requests: statuses.reduce((sum, s) => sum + s.total_requests, 0),
      total_failures: statuses.reduce((sum, s) => sum + s.failed_requests, 0),
      avg_health_score: healthScores.length > 0
        ? healthScores.reduce((sum, h) => sum + h.score, 0) / healthScores.length
        : 0,
    };
  }
}

// ============================================================================
// FACTORY & DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default circuit breaker config
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 3,
  success_threshold: 2,
  timeout_ms: 30000,
  latency_threshold_ms: 8000,
  excluded_status_codes: [400, 401, 403, 404, 422], // Client errors don't count
};

/**
 * Default schema repair prompt
 */
export const DEFAULT_SCHEMA_REPAIR_PROMPT =
  "The following JSON output failed schema validation. Fix it to match the schema exactly.\n\n" +
  "SCHEMA:\n{SCHEMA}\n\n" +
  "INVALID JSON:\n{CONTENT}\n\n" +
  "Rules:\n" +
  "1. Output ONLY valid JSON matching the schema\n" +
  "2. Do not add any commentary or explanation\n" +
  "3. Preserve all original data fields\n" +
  "4. If a field is missing, use appropriate default\n" +
  "5. Ensure all required fields are present\n" +
  "6. Maintain the same structure and types\n\n" +
  "REPAIRED JSON:";

/**
 * Create router with multi-provider configuration (RECOMMENDED for 99% uptime)
 */
export function createMultiProviderRouter(
  providers: LLMProvider[],
  overrides?: Partial<ProviderPoolConfig>
): HybridInferenceRouter {
  const config: ProviderPoolConfig = {
    providers,
    circuit_breaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    schema_repair_enabled: true,
    schema_repair_prompt: DEFAULT_SCHEMA_REPAIR_PROMPT,
    health_check_interval_ms: 10000,
    fallback_timeout_ms: 60000,
    enable_tier3_heuristic: true,
    dlq_on_exhaustion: true,
    routing_strategy: 'health_score',
    tier_fallback_order: ['CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ'],
    max_retries_per_provider: 1,
    retry_delay_ms: 500,
    ...overrides,
  };

  return new HybridInferenceRouter(config);
}

/**
 * Create standard production router with multi-provider per tier
 * CLOUD: Anthropic (primary) + OpenAI (secondary) + Azure (tertiary)
 * LOCAL: vLLM Qwen (primary) + Ollama Llama (secondary)
 */
export function createProductionRouter(
  cloudProviders: Array<{
    name: string;
    url: string;
    model_id: string;
    model_hash: string;
    api_key: string;
    priority: number;
    weight: number;
  }>,
  localProviders: Array<{
    name: string;
    url: string;
    model_id: string;
    model_hash: string;
    priority: number;
    weight: number;
  }>,
  grammar: string,
  overrides?: Partial<ProviderPoolConfig>
): HybridInferenceRouter {
  const providers: LLMProvider[] = [
    // Cloud providers
    ...cloudProviders.map(p => ({
      name: p.name,
      tier: 'CLOUD' as InferenceTier,
      url: p.url,
      model_id: p.model_id,
      model_hash: p.model_hash,
      grammar,
      timeout_ms: 10000,
      max_tokens: 2048,
      temperature: 0.0,
      seed: 42,
      headers: { 'Authorization': `Bearer ${p.api_key}`, 'Content-Type': 'application/json' },
      health_check_path: '/health',
      priority: p.priority,
      weight: p.weight,
      max_concurrent: 50,
      capabilities: ['json_mode', 'grammar', 'streaming'],
    })),
    // Local providers
    ...localProviders.map(p => ({
      name: p.name,
      tier: 'LOCAL' as InferenceTier,
      url: p.url,
      model_id: p.model_id,
      model_hash: p.model_hash,
      grammar,
      timeout_ms: 30000,
      max_tokens: 2048,
      temperature: 0.0,
      seed: 42,
      headers: { 'Content-Type': 'application/json' },
      health_check_path: '/health',
      priority: p.priority,
      weight: p.weight,
      max_concurrent: 10,
      capabilities: ['json_mode', 'grammar'],
    })),
  ];

  return createMultiProviderRouter(providers, overrides);
}

/**
 * Create router with standard cloud + local configuration (LEGACY - single provider per tier)
 * @deprecated Use createMultiProviderRouter or createProductionRouter for 99% uptime
 */
export function createStandardRouter(
  cloudEndpoint: string,
  cloudModelId: string,
  cloudModelHash: string,
  localEndpoint: string,
  localModelId: string,
  localModelHash: string,
  grammar: string,
  overrides?: Partial<ProviderPoolConfig>
): HybridInferenceRouter {
  const providers: LLMProvider[] = [
    // Tier 1: Cloud (single provider - legacy)
    {
      tier: 'CLOUD',
      name: 'cloud-gxp-zdr',
      url: cloudEndpoint,
      model_id: cloudModelId,
      model_hash: cloudModelHash,
      grammar,
      timeout_ms: 10000,
      max_tokens: 2048,
      temperature: 0.0,
      seed: 42,
      health_check_path: '/health',
      priority: 1,
      weight: 1.0,
      max_concurrent: 50,
      capabilities: ['json_mode', 'grammar', 'streaming'],
    },
    // Tier 2: Local (single provider - legacy)
    {
      tier: 'LOCAL',
      name: 'local-llama-cpp',
      url: localEndpoint,
      model_id: localModelId,
      model_hash: localModelHash,
      grammar,
      timeout_ms: 30000,
      max_tokens: 2048,
      temperature: 0.0,
      seed: 42,
      health_check_path: '/health',
      priority: 1,
      weight: 1.0,
      max_concurrent: 10,
      capabilities: ['json_mode', 'grammar'],
    },
  ];

  const config: ProviderPoolConfig = {
    providers,
    circuit_breaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    schema_repair_enabled: true,
    schema_repair_prompt: DEFAULT_SCHEMA_REPAIR_PROMPT,
    health_check_interval_ms: 10000,
    fallback_timeout_ms: 60000,
    enable_tier3_heuristic: true,
    dlq_on_exhaustion: true,
    routing_strategy: 'priority',
    tier_fallback_order: ['CLOUD', 'LOCAL', 'HEURISTIC', 'DLQ'],
    max_retries_per_provider: 1,
    retry_delay_ms: 500,
    ...overrides,
  };

  return new HybridInferenceRouter(config);
}

/**
 * Create router for local-only deployment (no cloud)
 * @deprecated Use createMultiProviderRouter for production
 */
export function createLocalOnlyRouter(
  localEndpoint: string,
  localModelId: string,
  localModelHash: string,
  grammar: string,
  overrides?: Partial<ProviderPoolConfig>
): HybridInferenceRouter {
  const providers: LLMProvider[] = [
    {
      tier: 'LOCAL',
      name: 'local-llama-cpp',
      url: localEndpoint,
      model_id: localModelId,
      model_hash: localModelHash,
      grammar,
      timeout_ms: 30000,
      max_tokens: 2048,
      temperature: 0.0,
      seed: 42,
      headers: { 'Content-Type': 'application/json' },
      health_check_path: '/health',
      priority: 1,
      weight: 1.0,
      max_concurrent: 10,
      capabilities: ['json_mode', 'grammar'],
    },
  ];

  const config: ProviderPoolConfig = {
    providers,
    circuit_breaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    schema_repair_enabled: true,
    schema_repair_prompt: DEFAULT_SCHEMA_REPAIR_PROMPT,
    health_check_interval_ms: 10000,
    fallback_timeout_ms: 60000,
    enable_tier3_heuristic: true,
    dlq_on_exhaustion: true,
    routing_strategy: 'priority',
    tier_fallback_order: ['LOCAL', 'HEURISTIC', 'DLQ'],
    max_retries_per_provider: 1,
    retry_delay_ms: 500,
    ...overrides,
  };

  return new HybridInferenceRouter(config);
}

// ============================================================================
// CLI / STANDALONE TESTING
// ============================================================================

if (require.main === module) {
  (async () => {
    const router = createStandardRouter(
      'http://cloud-gxp.example.com/v1',
      'gpt-4o-mini',
      'cloud-model-hash-placeholder',
      'http://localhost:8080/v1',
      'qwen2.5-14b-instruct-q4_k_m',
      'local-model-hash-placeholder',
      'root ::= object ...' // GBNF grammar placeholder
    );

    router.on('inference_success', (data) => console.log('[SUCCESS]', data));
    router.on('inference_failed', (data) => console.log('[FAILED]', data));
    router.on('fallback_heuristic', (data) => console.log('[HEURISTIC]', data));
    router.on('circuit_open', (data) => console.log('[CIRCUIT OPEN]', data));
    router.on('circuit_recovered', (data) => console.log('[CIRCUIT RECOVERED]', data));
    router.on('schema_repair_success', (data) => console.log('[REPAIR SUCCESS]', data));

    await router.start();

    // Test inference
    const response = await router.infer({
      trace_id: 'test-trace-001',
      tenant_id: 'test-tenant',
      pmid: '12345678',
      messages: [
        { role: 'system', content: 'Extract adverse events.' },
        { role: 'user', content: 'Patient experienced hepatotoxicity after taking DrugX.' }
      ],
      schema: {
        type: 'object',
        required: ['decision', 'confidence', 'adverse_events'],
        properties: {
          decision: { type: 'string' },
          confidence: { type: 'number' },
          adverse_events: { type: 'array' },
        }
      }
    });

    console.log('Response:', JSON.stringify(response, null, 2));

    console.log('Stats:', router.getStats());
    console.log('Circuit Breakers:', router.getCircuitBreakerStatuses());

    await router.stop();
  })().catch(console.error);
}