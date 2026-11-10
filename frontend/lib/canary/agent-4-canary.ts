/**
 * Agent-4 Canary (Screening)
 * Lightweight health check for screening agent pipeline
 */

export interface CanaryCheck {
  name: string;
  passed: boolean;
  latencyMs: number;
  error?: string;
}

export interface CanaryHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  checks: CanaryCheck[];
  timestamp: string;
}

export interface CanaryAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  checkName: string;
}

export interface CanaryResult {
  alerts: CanaryAlert[];
  runAt: string;
}

let globalCanary: Agent4Canary | null = null;

export class Agent4Canary {
  private checks: Array<{ name: string; fn: () => Promise<CanaryCheck> }> = [];

  constructor() {
    this.registerDefaultChecks();
  }

  private registerDefaultChecks() {
    // Basic connectivity check
    this.checks.push({
      name: 'screening-service-init',
      fn: async () => {
        const start = Date.now();
        try {
          // Lazy import to avoid circular deps
          const { screeningService } = await import('@/lib/literature/screening/screening-service');
          // Just verify it initializes
          const status = screeningService.getStatus();
          return {
            name: 'screening-service-init',
            passed: true,
            latencyMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name: 'screening-service-init',
            passed: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });

    // Agent adapter check
    this.checks.push({
      name: 'agentic-ai-adapter',
      fn: async () => {
        const start = Date.now();
        try {
          const { createScreeningService } = await import('@/lib/adapters/agentic-ai-screening-adapter');
          const service = createScreeningService();
          // Just verify it creates
          return {
            name: 'agentic-ai-adapter',
            passed: !!service,
            latencyMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name: 'agentic-ai-adapter',
            passed: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });

    // Database connectivity (if available)
    this.checks.push({
      name: 'database-pool',
      fn: async () => {
        const start = Date.now();
        try {
          const { getPostgresPool } = await import('@/lib/database/postgres');
          const pool = getPostgresPool();
          const result = await pool.query('SELECT 1');
          return {
            name: 'database-pool',
            passed: result.rows[0]?.[1] === 1,
            latencyMs: Date.now() - start,
          };
        } catch (error) {
          return {
            name: 'database-pool',
            passed: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  async runOnce(): Promise<CanaryCheck[]> {
    const results: CanaryCheck[] = [];
    for (const check of this.checks) {
      try {
        const result = await check.fn();
        results.push(result);
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          latencyMs: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  getHealth(): CanaryHealth {
    const checks = this.checks.map(c => ({ name: c.name, passed: false, latencyMs: 0 }));
    // This is a synchronous health check - in production you'd cache the last run
    return {
      status: 'HEALTHY', // Would be computed from last run
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  checkAlerts(): CanaryResult {
    // In a real implementation, this would analyze historical runs
    return {
      alerts: [],
      runAt: new Date().toISOString(),
    };
  }
}

export function getGlobalCanary(): Agent4Canary {
  if (!globalCanary) {
    globalCanary = new Agent4Canary();
  }
  return globalCanary;
}