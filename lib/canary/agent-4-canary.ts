/**
 * Agent-4 Screening Canary
 *
 * Synthetic monitoring for agent-4-screening.
 * Runs every 30s (liveness) and 60s (E2E screening).
 * Alerts on P99 > 15s or error rate > 1%.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 */

import { createScreeningAgent } from '../agents/agent-4-screening';
import { createLocalOnlyRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';

// ============================================================================
// TYPES
// ============================================================================

export interface CanaryResult {
  name: string;
  passed: boolean;
  latencyMs: number;
  error?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface CanaryConfig {
  agentId: string;
  intervalMs: number;
  timeoutMs: number;
  alertThreshold: {
    maxLatencyMs: number;
    maxErrorRate: number;
  };
}

// ============================================================================
// TEST CASES (Golden test subset for canary)
// ============================================================================

const CANARY_TEST_CASES = [
  {
    id: 'canary-001',
    name: 'Positive Control - Company Drug + Serious AE',
    input: {
      article: {
        pmid: 'CANARY-POS-001',
        title: 'Severe hepatotoxicity requiring hospitalization after DrugX therapy',
        abstract: 'A 45-year-old male developed severe hepatotoxicity 3 weeks after starting DrugX 100mg daily. Patient was hospitalized for 7 days. Liver enzymes peaked at ALT 1200 U/L. DrugX was discontinued and patient recovered.',
        journal: 'Liver International',
        publication_date: '2024-03-01',
        language: 'en',
        publication_types: ['Case Report', 'Clinical Study'],
        chemicals: ['DrugX']
      },
      matched_products: [
        { product_id: 'PROD-001', brand_name: 'DrugX', active_substances: ['SubstanceX'] }
      ]
    },
    expectedDecision: 'INCLUDE',
    expectedHumanReview: true,
    maxLatencyMs: 10000
  },
  {
    id: 'canary-002',
    name: 'Negative Control - In-vitro Study',
    input: {
      article: {
        pmid: 'CANARY-NEG-001',
        title: 'In vitro binding affinity of DrugX to receptor Y',
        abstract: 'We studied the binding of DrugX to receptor Y in vitro using cell lines. No human subjects involved.',
        journal: 'Journal of Pharmacology',
        publication_date: '2024-01-15',
        language: 'en',
        publication_types: ['In Vitro'],
        chemicals: ['DrugX']
      },
      matched_products: [
        { product_id: 'PROD-001', brand_name: 'DrugX', active_substances: ['SubstanceX'] }
      ]
    },
    expectedDecision: 'EXCLUDE_NON_CLINICAL',
    expectedHumanReview: false,
    maxLatencyMs: 5000
  },
  {
    id: 'canary-003',
    name: 'Non-English Article with Translation',
    input: {
      article: {
        pmid: 'CANARY-TRANS-001',
        title: 'Efectos adversos graves del DrugX en pacientes ancianos',
        abstract: 'Estudio de caso de un paciente de 80 años que desarrolló hepatotoxicidad severa tras tratamiento con DrugX. Requiere hospitalización.',
        journal: 'Revista Española de Farmacología',
        publication_date: '2024-05-01',
        language: 'es',
        publication_types: ['Case Report'],
        chemicals: ['DrugX']
      },
      matched_products: [
        { product_id: 'PROD-001', brand_name: 'DrugX', active_substances: ['SubstanceX'] }
      ]
    },
    expectedDecision: 'INCLUDE',
    expectedHumanReview: true,
    maxLatencyMs: 10000
  }
];

// ============================================================================
// CANARY RUNNER
// ============================================================================

export class Agent4Canary {
  private agent: ReturnType<typeof createScreeningAgent>;
  private config: CanaryConfig;
  private results: CanaryResult[] = [];
  private isRunning = false;

  constructor(config: Partial<CanaryConfig> = {}) {
    this.config = {
      agentId: 'agent-4-screening',
      intervalMs: 30000, // 30s for liveness
      timeoutMs: 15000,
      alertThreshold: {
        maxLatencyMs: 15000,
        maxErrorRate: 0.01, // 1%
      },
      ...config,
    };

    // Initialize agent with local-only router for fast canary runs
    const router = createLocalOnlyRouter();
    const auditLedger = new AuditLedgerService({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'nexus',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });
    const zdrStore = new ZDRStore({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.agent = createScreeningAgent({
      tenant_id: 'canary-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    });
  }

  /**
   * Run a single canary check (liveness + one E2E test)
   */
  async runOnce(): Promise<CanaryResult[]> {
    const results: CanaryResult[] = [];

    // 1. Liveness check - just verify agent instantiation and basic execution
    const livenessStart = Date.now();
    try {
      const livenessInput = {
        correlation_id: `canary-liveness-${Date.now()}`,
        trace_context: {
          trace_id: `canary-trace-${Date.now()}`,
          span_id: `canary-span-${Date.now()}`,
          tenant_id: 'canary-tenant',
        },
        payload: CANARY_TEST_CASES[1].input, // Simple negative control
        priority: 'high' as const,
        retry_count: 0,
        max_retries: 0,
      };

      await this.agent.executeWithRetry(livenessInput);
      results.push({
        name: 'agent-4-liveness',
        passed: true,
        latencyMs: Date.now() - livenessStart,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      results.push({
        name: 'agent-4-liveness',
        passed: false,
        latencyMs: Date.now() - livenessStart,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }

    // 2. E2E Screening check - run all test cases
    for (const testCase of CANARY_TEST_CASES) {
      const startTime = Date.now();
      try {
        const input = {
          correlation_id: `canary-${testCase.id}-${Date.now()}`,
          trace_context: {
            trace_id: `canary-trace-${testCase.id}-${Date.now()}`,
            span_id: `canary-span-${testCase.id}-${Date.now()}`,
            tenant_id: 'canary-tenant',
          },
          payload: testCase.input,
          priority: 'normal' as const,
          retry_count: 0,
          max_retries: 0,
        };

        const result = await this.agent.executeWithRetry(input);
        const latencyMs = Date.now() - startTime;

        // Validate output
        const decisionMatch = result.output?.screening_result?.decision === testCase.expectedDecision;
        const actualHumanReview = result.output?.human_review_status === 'AWAITING_HUMAN_REVIEW';
        const humanReviewMatch = actualHumanReview === testCase.expectedHumanReview;
        const latencyOk = latencyMs <= testCase.maxLatencyMs;

        const passed = decisionMatch && humanReviewMatch && latencyOk;

        results.push({
          name: `agent-4-e2e-${testCase.name}`,
          passed,
          latencyMs,
          timestamp: new Date().toISOString(),
          details: {
            expectedDecision: testCase.expectedDecision,
            actualDecision: result.output?.screening_result?.decision,
            expectedHumanReview: testCase.expectedHumanReview,
            actualHumanReview: !!result.output?.human_review_status,
            latencyOk,
            executionTier: result.output?.execution_tier,
          },
        });

        if (!passed) {
          console.warn(`[Canary] ${testCase.name} FAILED:`, {
            decisionMatch,
            humanReviewMatch,
            latencyOk,
            latencyMs,
          });
        }

      } catch (error) {
        results.push({
          name: `agent-4-e2e-${testCase.name}`,
          passed: false,
          latencyMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.results.push(...results);
    // Keep only last 1000 results
    if (this.results.length > 1000) {
      this.results = this.results.slice(-1000);
    }

    return results;
  }

  /**
   * Start continuous canary monitoring
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const runLoop = async () => {
      while (this.isRunning) {
        try {
          await this.runOnce();
        } catch (error) {
          console.error('[Canary] Run loop error:', error);
        }
        await new Promise(resolve => setTimeout(resolve, this.config.intervalMs));
      }
    };

    runLoop();
    console.log(`[Canary] Started agent-4 canary (interval: ${this.config.intervalMs}ms)`);
  }

  /**
   * Stop canary monitoring
   */
  stop(): void {
    this.isRunning = false;
    console.log('[Canary] Stopped agent-4 canary');
  }

  /**
   * Get recent results for alerting
   */
  getRecentResults(sinceMs: number = 300000): CanaryResult[] { // Last 5 min
    const cutoff = Date.now() - sinceMs;
    return this.results.filter(r => new Date(r.timestamp).getTime() > cutoff);
  }

  /**
   * Check alert conditions
   */
  checkAlerts(): { shouldAlert: boolean; alerts: string[] } {
    const recent = this.getRecentResults();
    if (recent.length === 0) return { shouldAlert: false, alerts: [] };

    const livenessResults = recent.filter(r => r.name === 'agent-4-liveness');
    const e2eResults = recent.filter(r => r.name.startsWith('agent-4-e2e-'));

    const alerts: string[] = [];

    // Check liveness failure rate
    if (livenessResults.length > 0) {
      const livenessFailures = livenessResults.filter(r => !r.passed).length;
      const livenessErrorRate = livenessFailures / livenessResults.length;
      if (livenessErrorRate > this.config.alertThreshold.maxErrorRate) {
        alerts.push(`Liveness error rate ${(livenessErrorRate * 100).toFixed(1)}% exceeds ${(this.config.alertThreshold.maxErrorRate * 100).toFixed(1)}%`);
      }
    }

    // Check E2E failure rate
    if (e2eResults.length > 0) {
      const e2eFailures = e2eResults.filter(r => !r.passed).length;
      const e2eErrorRate = e2eFailures / e2eResults.length;
      if (e2eErrorRate > this.config.alertThreshold.maxErrorRate) {
        alerts.push(`E2E error rate ${(e2eErrorRate * 100).toFixed(1)}% exceeds ${(this.config.alertThreshold.maxErrorRate * 100).toFixed(1)}%`);
      }

      // Check P99 latency
      const latencies = e2eResults.map(r => r.latencyMs).sort((a, b) => a - b);
      const p99Index = Math.ceil(latencies.length * 0.99) - 1;
      const p99Latency = latencies[Math.max(0, p99Index)];
      if (p99Latency > this.config.alertThreshold.maxLatencyMs) {
        alerts.push(`P99 latency ${p99Latency}ms exceeds ${this.config.alertThreshold.maxLatencyMs}ms`);
      }
    }

    return { shouldAlert: alerts.length > 0, alerts };
  }

  /**
   * Get health status for /health endpoint
   */
  getHealth(): {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    lastCheck: string;
    errorRate: number;
    p99LatencyMs: number;
    consecutiveFailures: number;
  } {
    const recent = this.getRecentResults(60000); // Last 1 min
    const e2eResults = recent.filter(r => r.name.startsWith('agent-4-e2e-'));

    if (e2eResults.length === 0) {
      return {
        status: 'HEALTHY', // No data yet, assume healthy
        lastCheck: new Date().toISOString(),
        errorRate: 0,
        p99LatencyMs: 0,
        consecutiveFailures: 0,
      };
    }

    const failures = e2eResults.filter(r => !r.passed).length;
    const errorRate = failures / e2eResults.length;

    const latencies = e2eResults.map(r => r.latencyMs).sort((a, b) => a - b);
    const p99Index = Math.ceil(latencies.length * 0.99) - 1;
    const p99Latency = latencies[Math.max(0, p99Index)];

    // Count consecutive failures at the end
    let consecutiveFailures = 0;
    for (let i = e2eResults.length - 1; i >= 0; i--) {
      if (!e2eResults[i].passed) consecutiveFailures++;
      else break;
    }

    let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    if (errorRate > 0.05 || consecutiveFailures >= 3 || p99Latency > this.config.alertThreshold.maxLatencyMs) {
      status = 'UNHEALTHY';
    } else if (errorRate > 0.01 || p99Latency > this.config.alertThreshold.maxLatencyMs * 0.5) {
      status = 'DEGRADED';
    }

    return {
      status,
      lastCheck: e2eResults[e2eResults.length - 1]?.timestamp || new Date().toISOString(),
      errorRate,
      p99LatencyMs: p99Latency,
      consecutiveFailures,
    };
  }
}

// ============================================================================
// FACTORY & EXPORTS
// ============================================================================

export function createAgent4Canary(config?: Partial<CanaryConfig>): Agent4Canary {
  return new Agent4Canary(config);
}

// Singleton for global access
let globalCanary: Agent4Canary | null = null;

export function getGlobalCanary(): Agent4Canary {
  if (!globalCanary) {
    globalCanary = createAgent4Canary();
  }
  return globalCanary;
}

export function startGlobalCanary(): void {
  getGlobalCanary().start();
}

export function stopGlobalCanary(): void {
  globalCanary?.stop();
}