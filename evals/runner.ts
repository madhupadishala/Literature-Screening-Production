/**
 * Nexus Evaluation Runner
 *
 * Executes golden test cases against all 9 core agents.
 * Usage: npx tsx evals/runner.ts [--agent <agent-id>] [--llm-judge] [--parallel]
 *
 * Modes:
 *  - Mock mode (default): Uses mock LLM router for fast CI/CD
 *  - LLM mode: Uses real LLM inference via HybridInferenceRouter
 *  - LLM Judge mode: Uses LLM-as-judge for semantic evaluation
 */

import { createEvalHarness, EvalConfig } from './harness';
import { createLiteratureDuplicatesAgent } from '../lib/agents/agent-1-literature-duplicates';
import { createICSRDuplicatesAgent } from '../lib/agents/agent-2-icsr-duplicates';
import { createFollowUpGeneratorAgent } from '../lib/agents/agent-3-followup-generator';
import { createScreeningAgent } from '../lib/agents/agent-4-screening';
import { createActionTakenAgent } from '../lib/agents/agent-5-action-taken';
import { createDechallengeAgent } from '../lib/agents/agent-6-dechallenge';
import { createRechallengeAgent } from '../lib/agents/agent-7-rechallenge';
import { createMedicalHistoryAgent } from '../lib/agents/agent-8-medical-history';
import { createCausalityAgent } from '../lib/agents/agent-9-causality';
import { createIntakeTriageAgent } from '../lib/agents/agent-14-intake-triage';
import { createDrugExtractionAgent } from '../lib/agents/agent-15-drug-extraction';
import { createReporterIdentificationAgent } from '../lib/agents/agent-16-reporter-id';
import { createClockStartAgent } from '../lib/agents/agent-17-clock-start';
import { HybridInferenceRouter, createLocalOnlyRouter, createProductionRouter } from '../lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../lib/audit/audit-ledger-service';
import { ZDRStore } from '../lib/infrastructure/redis-zdr-store';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// AGENT FACTORY FOR EVALUATION
// ============================================================================

async function createEvalAgents(runnerConfig: RunnerConfig) {
  // Create shared infrastructure
  const router = runnerConfig.useRealLLM
    ? createProductionRouter({
        providers: [], // Would be configured from env
      })
    : createLocalOnlyRouter();

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

  return {
    'agent-1-literature-duplicates': createLiteratureDuplicatesAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-2-icsr-duplicates': createICSRDuplicatesAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-3-followup-generator': createFollowUpGeneratorAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-3-patient-identification': (await import('../lib/agents/agent-3-patient-identification')).createPatientIdentificationAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-4-screening': createScreeningAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-5-action-taken': createActionTakenAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-6-dechallenge': createDechallengeAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-7-rechallenge': createRechallengeAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-8-medical-history': createMedicalHistoryAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-8-country-incident': (await import('../lib/agents/agent-8-country-incident')).createCountryIncidentAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-9-causality': createCausalityAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-14-intake-triage': createIntakeTriageAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-15-drug-extraction': createDrugExtractionAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-16-reporter-id': createReporterIdentificationAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-17-clock-start': createClockStartAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
    'agent-25-icsr-validity': (await import('../lib/agents/agent-25-icsr-validity')).createIcsrValidityAgent({
      tenant_id: 'eval-tenant',
      inference_router: router,
      audit_ledger: auditLedger,
      zdr_store: zdrStore,
    }),
  };
}

// ============================================================================
// CONFIGURATION & CLI ARGUMENTS
// ============================================================================

interface RunnerConfig {
  agentFilter?: string;
  useRealLLM: boolean;
  enableLLMJudge: boolean;
  parallel: boolean;
  outputFormat: 'console' | 'json' | 'junit';
  outputFile?: string;
  llmProvider?: 'anthropic' | 'openai' | 'azure' | 'local';
  llmModel?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
}

function parseArgs(): RunnerConfig {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    useRealLLM: false,
    enableLLMJudge: false,
    parallel: false,
    outputFormat: 'console',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agent':
        config.agentFilter = args[++i];
        break;
      case '--real-llm':
        config.useRealLLM = true;
        break;
      case '--llm-judge':
        config.enableLLMJudge = true;
        break;
      case '--parallel':
        config.parallel = true;
        break;
      case '--output':
        config.outputFormat = args[++i] as any;
        break;
      case '--output-file':
        config.outputFile = args[++i];
        break;
      case '--llm-provider':
        config.llmProvider = args[++i] as any;
        break;
      case '--llm-model':
        config.llmModel = args[++i];
        break;
      case '--llm-api-key':
        config.llmApiKey = args[++i];
        break;
      case '--llm-base-url':
        config.llmBaseUrl = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }
  return config;
}

function printHelp(): void {
  console.log(`
Nexus Evaluation Runner

Usage: npx tsx evals/runner.ts [options]

Options:
  --agent <id>           Run only specific agent (default: all 9 agents)
  --real-llm             Use real LLM inference instead of mock
  --llm-judge            Enable LLM-as-judge for semantic evaluation
  --parallel             Run test cases in parallel
  --output <format>      Output format: console|json|junit (default: console)
  --output-file <path>   Write results to file
  --llm-provider <name>  LLM provider: anthropic|openai|azure|local (default: local)
  --llm-model <name>     Model name (default: qwen2.5-14b-instruct-q4_k_m)
  --llm-api-key <key>    API key for cloud providers
  --llm-base-url <url>   Base URL for local/OpenAI-compatible endpoints
  --help                 Show this help

Examples:
  # Quick CI mode (mock, all agents)
  npx tsx evals/runner.ts

  # Full LLM evaluation with judge
  npx tsx evals/runner.ts --real-llm --llm-judge --llm-provider anthropic --llm-model claude-3-5-sonnet-20241022 --llm-api-key \$ANTHROPIC_API_KEY

  # Local LLM with Ollama
  npx tsx evals/runner.ts --real-llm --llm-provider local --llm-model qwen2.5-14b-instruct-q4_k_m --llm-base-url http://localhost:11434/v1

  # Single agent with JSON output
  npx tsx evals/runner.ts --agent agent-9-causality --output json --output-file results.json
`);
  process.exit(0);
}

// ============================================================================
// LOAD GOLDEN TEST CASES
// ============================================================================

function loadGoldenCases(agentId: string): any[] {
  const filePath = path.join(__dirname, 'golden', `${agentId}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`No golden cases found for ${agentId}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return data.test_cases || [];
}

// ============================================================================
// RUN EVALUATION
// ============================================================================

async function runEvaluation(agentId: string, runnerConfig: RunnerConfig): Promise<any> {
  const agents = await createEvalAgents(runnerConfig);
  const agent = agents[agentId];

  if (!agent) {
    console.error(`Agent ${agentId} not found`);
    return null;
  }

  const goldenCases = loadGoldenCases(agentId);
  if (goldenCases.length === 0) {
    console.warn(`No test cases for ${agentId}`);
    return null;
  }

  console.log(`\n=== Evaluating ${agentId} (${goldenCases.length} test cases) ===`);

  const config: EvalConfig = {
    agent_id: agentId,
    golden_set_path: `evals/golden/${agentId}.json`,
    code_metrics_enabled: true,
    llm_judges_enabled: runnerConfig.enableLLMJudge,
    parallel: runnerConfig.parallel,
    timeout_ms: 30000,
  };

  const harness = createEvalHarness(config);

  // We need to adapt the harness to use our golden cases directly
  // For now, run manually

  // Initialize LLM Judge if enabled
  let llmJudge: any = null;
  if (runnerConfig.enableLLMJudge) {
    try {
      const { createLLMJudge } = await import('./llm-judge');
      llmJudge = createLLMJudge({
        provider: runnerConfig.llmProvider || 'local',
        model: runnerConfig.llmModel,
        apiKey: runnerConfig.llmApiKey,
        baseUrl: runnerConfig.llmBaseUrl,
      });
      console.log('[Runner] LLM Judge initialized');
    } catch (err) {
      console.warn('[Runner] Failed to initialize LLM Judge:', err);
    }
  }

  const testCases = goldenCases;
  const runTestCase = async (testCase: any) => {
    try {
      const input = {
        correlation_id: `eval-${testCase.id}`,
        trace_context: {
          trace_id: `eval-trace-${testCase.id}`,
          span_id: `eval-span-${testCase.id}`,
          tenant_id: 'eval-tenant',
        },
        payload: testCase.input,
        priority: 'normal' as const,
        retry_count: 0,
        max_retries: 0,
      };

      const result = await agent.executeWithRetry(input);

      // Code-based comparison
      const codeMatch = compareOutput(result.output, testCase.expected_output);

      // LLM Judge evaluation if enabled
      let llmJudgeResult = { passed: true, score: 1.0, reasoning: 'Not evaluated' };
      if (llmJudge && runnerConfig.enableLLMJudge) {
        try {
          llmJudgeResult = await llmJudge.evaluate({
            testCase: testCase.name,
            input: testCase.input,
            expected: testCase.expected_output,
            actual: result.output,
            criteria: testCase.evaluation_criteria || 'Evaluate if the actual output correctly matches the expected output semantically',
          });
        } catch (err) {
          console.warn(`[Runner] LLM Judge failed for ${testCase.name}:`, err);
        }
      }

      // Combine code-based and LLM judge results
      const casePassed = codeMatch.passed && (llmJudgeResult.passed || !runnerConfig.enableLLMJudge);
      const score = runnerConfig.enableLLMJudge
        ? (codeMatch.score + llmJudgeResult.score) / 2
        : codeMatch.score;

      return { passed: casePassed, score, details: { code: codeMatch.details, llm: llmJudgeResult.reasoning } };

    } catch (error) {
      return {
        passed: false,
        score: 0,
        error: error instanceof Error ? error.message : String(error),
        details: { error: String(error) }
      };
    }
  };

  let passed = 0;
  let failed = 0;
  const results: any[] = [];

  if (runnerConfig.parallel) {
    // Run in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < goldenCases.length; i += concurrency) {
      const batch = goldenCases.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(runTestCase));

      for (let j = 0; j < batch.length; j++) {
        const testCase = batch[j];
        const result = batchResults[j];

        if (result.passed) {
          passed++;
          console.log(`  ✅ ${testCase.name}`);
        } else {
          failed++;
          console.log(`  ❌ ${testCase.name} - Score: ${result.score.toFixed(2)}`);
          console.log(`     Details:`);
          console.log(JSON.stringify(result.details, null, 2).substring(0, 2000));
        }
        results.push({
          test_case_id: testCase.id,
          passed: result.passed,
          score: result.score,
          details: result.details,
        });
      }
    }
  } else {
    for (const testCase of goldenCases) {
      const result = await runTestCase(testCase);

      if (result.passed) {
        passed++;
        console.log(`  ✅ ${testCase.name}`);
      } else {
        failed++;
        console.log(`  ❌ ${testCase.name} - Score: ${result.score.toFixed(2)}`);
        console.log(`     Details: ${JSON.stringify(result.details).slice(0, 200)}`);
      }
      results.push({
        test_case_id: testCase.id,
        passed: result.passed,
        score: result.score,
        details: result.details,
      });
    }
  }

  console.log(`\n${agentId}: ${passed}/${goldenCases.length} passed (${(passed/goldenCases.length*100).toFixed(1)}%)`);

  return { agentId, passed, failed, total: goldenCases.length, results };
}

function compareOutput(actual: any, expected: any): { passed: boolean; score: number; details: any } {
  if (actual === undefined && expected === undefined) {
    return { passed: true, score: 1.0, details: 'Both undefined' };
  }
  if (actual === undefined || expected === undefined) {
    return { passed: false, score: 0, details: 'One is undefined' };
  }

  // Handle flexible matching for objects with special matchers
  const result = deepCompare(actual, expected);
  return {
    passed: result.match,
    score: result.score,
    details: result.details,
  };
}

function deepCompare(actual: any, expected: any, path = ''): { match: boolean; score: number; details: any } {
  // Handle special matchers in expected
  if (expected && typeof expected === 'object') {
    // Check for min/max matchers
    if ('min' in expected || 'max' in expected) {
      const num = Number(actual);
      if (isNaN(num)) return { match: false, score: 0, details: `Expected number at ${path}` };
      let match = true;
      if ('min' in expected && num < expected.min) match = false;
      if ('max' in expected && num > expected.max) match = false;
      return { match, score: match ? 1.0 : 0.5, details: match ? 'OK' : `Value ${num} outside range` };
    }

    // Check for contains matcher
    if ('contains' in expected) {
      const str = String(actual).toLowerCase();
      const match = str.includes(expected.contains.toLowerCase());
      return { match, score: match ? 1.0 : 0, details: match ? 'Contains' : `Missing "${expected.contains}"` };
    }

    // Check for not_null matcher
    if ('not_null' in expected) {
      const match = actual !== null && actual !== undefined;
      return { match, score: match ? 1.0 : 0, details: match ? 'Not null' : 'Is null' };
    }

    // Check for length_min matcher
    if ('length_min' in expected && Array.isArray(actual)) {
      const match = actual.length >= expected.length_min;
      return { match, score: match ? 1.0 : 0.5, details: `Length ${actual.length} vs min ${expected.length_min}` };
    }
  }

  // Handle primitives
  if (typeof actual !== 'object' || typeof expected !== 'object' || actual === null || expected === null) {
    const match = actual === expected;
    return { match, score: match ? 1.0 : 0.0, details: match ? 'Match' : `Mismatch at ${path}: ${actual} !== ${expected}` };
  }

  // Handle arrays
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      // For arrays, check if all expected items are in actual (subset match)
      const allFound = expected.every(expItem =>
        actual.some(actItem => deepCompare(actItem, expItem).match)
      );
      return { match: allFound, score: allFound ? 1.0 : 0.5, details: allFound ? 'All expected found' : 'Some expected missing' };
    }
    // Handle empty arrays
    if (actual.length === 0 && expected.length === 0) {
      return { match: true, score: 1.0, details: 'Both empty arrays' };
    }
    let totalScore = 0;
    let allMatch = true;
    for (let i = 0; i < actual.length; i++) {
      const itemResult = deepCompare(actual[i], expected[i], `${path}[${i}]`);
      totalScore += itemResult.score;
      if (!itemResult.match) allMatch = false;
    }
    return { match: allMatch, score: totalScore / actual.length, details: 'Array items' };
  }

  // Handle objects
  // Only compare keys that are in expected (lenient: ignore extra keys in actual)
  const expectedKeys = Object.keys(expected);

  let totalScore = 0;
  let allMatch = true;
  const details: Record<string, any> = {};

  for (const key of expectedKeys) {
    const keyPath = path ? `${path}.${key}` : key;
    const hasActual = key in actual;

    if (!hasActual) {
      allMatch = false;
      details[key] = { match: false, score: 0, detail: `Key missing in actual: ${key}` };
      continue;
    }

    const keyResult = deepCompare(actual[key], expected[key], keyPath);
    totalScore += keyResult.score;
    if (!keyResult.match) allMatch = false;
    details[key] = keyResult.details;
  }

  return { match: allMatch, score: expectedKeys.length > 0 ? totalScore / expectedKeys.length : 1.0, details };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const runnerConfig = parseArgs();

  const agentIds = runnerConfig.agentFilter
    ? [runnerConfig.agentFilter]
    : [
        'agent-1-literature-duplicates',
        'agent-2-icsr-duplicates',
        'agent-3-followup-generator',
        'agent-3-patient-identification',
        'agent-4-screening',
        'agent-5-action-taken',
        'agent-6-dechallenge',
        'agent-7-rechallenge',
        'agent-8-medical-history',
        'agent-8-country-incident',
        'agent-9-causality',
        'agent-14-intake-triage',
        'agent-15-drug-extraction',
        'agent-16-reporter-id',
        'agent-17-clock-start',
        'agent-25-icsr-validity',
      ];

  console.log('🚀 Nexus Evaluation Runner');
  console.log('============================');

  const allResults: any[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalCases = 0;

  for (const agentId of agentIds) {
    const result = await runEvaluation(agentId, runnerConfig);
    if (result) {
      allResults.push(result);
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalCases += result.total;
    }
  }

  console.log('\n============================');
  console.log('📊 FINAL SUMMARY');
  console.log('============================');
  console.log(`Total Agents: ${allResults.length}`);
  console.log(`Total Test Cases: ${totalCases}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Pass Rate: ${totalCases > 0 ? (totalPassed / totalCases * 100).toFixed(1) : 0}%`);

  console.log('\nPer-Agent Breakdown:');
  for (const r of allResults) {
    const rate = r.total > 0 ? (r.passed / r.total * 100).toFixed(1) : 0;
    console.log(`  ${r.agentId}: ${r.passed}/${r.total} (${rate}%)`);
  }

  // Exit code
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(console.error);