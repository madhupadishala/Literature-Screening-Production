/**
 * Nexus Agent Evaluation Harness
 *
 * Provides golden set evaluation, code-based metrics, and LLM judge framework
 * for all 8 core Phase 2 agents.
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from '../lib/agents/base-agent';
import { createHash } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface GoldenTestCase<TInput, TOutput> {
  id: string;
  name: string;
  description: string;
  input: TInput;
  expected_output: TOutput;
  tags: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface EvaluationResult {
  agent_id: string;
  test_case_id: string;
  passed: boolean;
  score: number;              // 0-1
  latency_ms: number;
  errors: string[];
  metrics: Record<string, number>;
  details: Record<string, any>;
}

export interface AgentEvalSuite<TInput, TOutput> {
  agent_id: string;
  golden_cases: GoldenTestCase<TInput, TOutput>[];
  code_metrics: CodeMetric<TInput, TOutput>[];
  llm_judges: LLMJudge<TOutput>[];
}

export interface CodeMetric<TInput, TOutput> {
  name: string;
  description: string;
  evaluate: (input: TInput, output: TOutput, result: AgentResult) => { passed: boolean; score: number; details?: any };
}

export interface LLMJudge<TOutput> {
  name: string;
  description: string;
  rubric: string;             // Prompt for LLM judge
  evaluate: (output: TOutput, expected: TOutput) => Promise<{ score: number; reasoning: string }>;
}

export interface EvalConfig {
  agent_id: string;
  golden_set_path: string;
  code_metrics_enabled: boolean;
  llm_judges_enabled: boolean;
  llm_judge_model?: string;
  parallel: boolean;
  timeout_ms: number;
}

// ============================================================================
// EVALUATION HARNESS
// ============================================================================

export class AgentEvalHarness {
  private results: EvaluationResult[] = [];
  private startTime: number = 0;

  constructor(private config: EvalConfig) {}

  /**
   * Run evaluation suite against an agent
   */
  async run(agent: BaseAgent): Promise<{
    summary: EvalSummary;
    results: EvaluationResult[];
  }> {
    this.results = [];
    this.startTime = Date.now();

    // Load golden test cases
    const goldenCases = await this.loadGoldenCases();
    console.log(`[${this.config.agent_id}] Loaded ${goldenCases.length} golden test cases`);

    // Run each test case
    for (const testCase of goldenCases) {
      if (this.config.parallel) {
        // Run in parallel batches (implementation depends on needs)
        await this.runTestCase(agent, testCase);
      } else {
        await this.runTestCase(agent, testCase);
      }
    }

    const summary = this.generateSummary();
    return { summary, results: this.results };
  }

  private async loadGoldenCases(): Promise<GoldenTestCase<any, any>[]> {
    // In production, load from JSON files
    // For now, return empty - actual cases defined per agent
    return [];
  }

  private async runTestCase(
    agent: BaseAgent,
    testCase: GoldenTestCase<any, any>
  ): Promise<void> {
    const caseStartTime = Date.now();

    // Build execution input
    const input: AgentExecutionInput = {
      correlation_id: `eval-${testCase.id}`,
      trace_context: {
        trace_id: `eval-trace-${testCase.id}`,
        span_id: `eval-span-${testCase.id}`,
        tenant_id: 'eval-tenant',
      },
      payload: testCase.input,
      priority: 'normal',
      retry_count: 0,
      max_retries: 0,
    };

    try {
      // Execute agent
      const result = await agent.executeWithRetry(input);
      const latencyMs = Date.now() - caseStartTime;

      // Run code-based metrics
      const metrics: Record<string, number> = {};
      const errors: string[] = [];

      // Compare output with expected
      const outputMatch = this.compareOutput(result.output, testCase.expected_output);

      // Code metrics (if enabled)
      if (this.config.code_metrics_enabled) {
        // Would run registered code metrics
      }

      // LLM judge (if enabled)
      if (this.config.llm_judges_enabled) {
        // Would run LLM judges
      }

      const passed = result.success && outputMatch.passed;
      const score = outputMatch.score;

      this.results.push({
        agent_id: this.config.agent_id,
        test_case_id: testCase.id,
        passed,
        score,
        latency_ms: latencyMs,
        errors,
        metrics,
        details: {
          actual_output: result.output,
          expected_output: testCase.expected_output,
          output_match: outputMatch.details,
          agent_result: {
            success: result.success,
            execution_tier: result.execution_tier,
            model_name: result.model_name,
            merkle_entry_hash: result.merkle_entry_hash,
          },
        },
      });

      console.log(`  ${passed ? '✅' : '❌'} ${testCase.name} (${latencyMs}ms, score: ${score.toFixed(2)})`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.results.push({
        agent_id: this.config.agent_id,
        test_case_id: testCase.id,
        passed: false,
        score: 0,
        latency_ms: Date.now() - caseStartTime,
        errors: [errorMsg],
        metrics: {},
        details: { error: errorMsg },
      });
      console.log(`  ❌ ${testCase.name} - ERROR: ${errorMsg}`);
    }
  }

  private compareOutput(actual: any, expected: any): { passed: boolean; score: number; details: any } {
    if (actual === undefined && expected === undefined) {
      return { passed: true, score: 1.0, details: 'Both undefined' };
    }
    if (actual === undefined || expected === undefined) {
      return { passed: false, score: 0, details: 'One is undefined' };
    }

    // Deep comparison with scoring
    const result = this.deepCompare(actual, expected);
    return {
      passed: result.match,
      score: result.score,
      details: result.details,
    };
  }

  private deepCompare(actual: any, expected: any, path = ''): { match: boolean; score: number; details: any } {
    // Handle primitives
    if (typeof actual !== 'object' || typeof expected !== 'object' || actual === null || expected === null) {
      const match = actual === expected;
      return { match, score: match ? 1.0 : 0.0, details: match ? 'Match' : `Mismatch at ${path}: ${actual} !== ${expected}` };
    }

    // Handle arrays
    if (Array.isArray(actual) && Array.isArray(expected)) {
      if (actual.length !== expected.length) {
        return { match: false, score: 0.5, details: `Array length mismatch at ${path}: ${actual.length} !== ${expected.length}` };
      }
      let totalScore = 0;
      let allMatch = true;
      const details: any[] = [];
      for (let i = 0; i < actual.length; i++) {
        const itemResult = this.deepCompare(actual[i], expected[i], `${path}[${i}]`);
        totalScore += itemResult.score;
        if (!itemResult.match) allMatch = false;
        details.push(itemResult.details);
      }
      return { match: allMatch, score: totalScore / actual.length, details };
    }

    // Handle objects
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    const allKeys = new Set([...actualKeys, ...expectedKeys]);

    let totalScore = 0;
    let allMatch = true;
    const details: Record<string, any> = {};

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;
      const hasActual = key in actual;
      const hasExpected = key in expected;

      if (!hasActual || !hasExpected) {
        allMatch = false;
        details[key] = { match: false, score: 0, detail: `Key missing: actual=${hasActual}, expected=${hasExpected}` };
        continue;
      }

      const keyResult = this.deepCompare(actual[key], expected[key], keyPath);
      totalScore += keyResult.score;
      if (!keyResult.match) allMatch = false;
      details[key] = keyResult.details;
    }

    return { match: allMatch, score: allKeys.size > 0 ? totalScore / allKeys.size : 1.0, details };
  }

  private generateSummary(): EvalSummary {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;
    const avgScore = total > 0 ? this.results.reduce((sum, r) => sum + r.score, 0) / total : 0;
    const avgLatency = total > 0 ? this.results.reduce((sum, r) => sum + r.latency_ms, 0) / total : 0;
    const totalTime = Date.now() - this.startTime;

    return {
      agent_id: this.config.agent_id,
      total_cases: total,
      passed,
      failed,
      pass_rate: total > 0 ? passed / total : 0,
      avg_score: avgScore,
      avg_latency_ms: avgLatency,
      total_time_ms: totalTime,
      timestamp: new Date().toISOString(),
    };
  }
}

export interface EvalSummary {
  agent_id: string;
  total_cases: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_score: number;
  avg_latency_ms: number;
  total_time_ms: number;
  timestamp: string;
}

// ============================================================================
// REGRESSION DETECTION
// ============================================================================

export interface RegressionReport {
  agent_id: string;
  baseline_run_id: string;
  current_run_id: string;
  regressions: Regression[];
  improvements: Improvement[];
  timestamp: string;
}

export interface Regression {
  test_case_id: string;
  metric: string;
  baseline_value: number;
  current_value: number;
  delta: number;
  severity: 'critical' | 'major' | 'minor';
}

export interface Improvement {
  test_case_id: string;
  metric: string;
  baseline_value: number;
  current_value: number;
  delta: number;
}

export class RegressionDetector {
  private baselineResults: Map<string, EvaluationResult[]> = new Map();

  setBaseline(agentId: string, results: EvaluationResult[]): void {
    this.baselineResults.set(agentId, results);
  }

  detect(currentResults: EvaluationResult[], agentId: string): RegressionReport {
    const baseline = this.baselineResults.get(agentId) || [];
    const baselineMap = new Map(baseline.map(r => [r.test_case_id, r]));
    const regressions: Regression[] = [];
    const improvements: Improvement[] = [];

    for (const current of currentResults) {
      const base = baselineMap.get(current.test_case_id);
      if (!base) continue;

      // Check score regression
      if (current.score < base.score - 0.1) {
        regressions.push({
          test_case_id: current.test_case_id,
          metric: 'score',
          baseline_value: base.score,
          current_value: current.score,
          delta: current.score - base.score,
          severity: current.score < base.score - 0.3 ? 'critical' :
                    current.score < base.score - 0.2 ? 'major' : 'minor',
        });
      } else if (current.score > base.score + 0.1) {
        improvements.push({
          test_case_id: current.test_case_id,
          metric: 'score',
          baseline_value: base.score,
          current_value: current.score,
          delta: current.score - base.score,
        });
      }

      // Check latency regression
      if (current.latency_ms > base.latency_ms * 1.5) {
        regressions.push({
          test_case_id: current.test_case_id,
          metric: 'latency_ms',
          baseline_value: base.latency_ms,
          current_value: current.latency_ms,
          delta: current.latency_ms - base.latency_ms,
          severity: current.latency_ms > base.latency_ms * 3 ? 'critical' : 'major',
        });
      }
    }

    return {
      agent_id: agentId,
      baseline_run_id: baseline[0]?.details?.run_id || 'unknown',
      current_run_id: currentResults[0]?.details?.run_id || 'unknown',
      regressions,
      improvements,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createEvalHarness(config: EvalConfig): AgentEvalHarness {
  return new AgentEvalHarness(config);
}

export function createRegressionDetector(): RegressionDetector {
  return new RegressionDetector();
}