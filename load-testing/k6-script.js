/**
 * NEXUS k6 Load Testing Script
 * ============================================================================
 * Tests agent pools under various load scenarios:
 * - Baseline throughput
 * - Stress testing
 * - Spike testing
 * - Soak testing
 * - Chaos engineering scenarios
 * ============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Test data - sample PMIDs and articles
const testArticles = new SharedArray('test articles', function() {
  return [
    {
      pmid: '12345678',
      title: 'Severe hepatotoxicity with DrugX therapy',
      abstract: 'A 45-year-old male developed severe hepatotoxicity after 3 weeks of DrugX 100mg daily. Patient was hospitalized for 7 days with ALT 1500 U/L. DrugX was discontinued and patient recovered.',
      journal: 'Liver International',
      publication_date: '2024-01-15',
      language: 'en',
      chemicals: ['DrugX', 'SubstanceX'],
      publication_types: ['Case Report'],
      matched_products: [{ product_id: 'PROD-001', brand_name: 'DrugX', active_substances: ['SubstanceX'] }]
    },
    {
      pmid: '12345679',
      title: 'Rash after DrugY initiation',
      abstract: 'A 30-year-old female developed rash 2 weeks after starting DrugY 50mg daily. Rash resolved after discontinuation.',
      journal: 'Dermatology Journal',
      publication_date: '2024-02-01',
      language: 'en',
      chemicals: ['DrugY'],
      publication_types: ['Case Report'],
      matched_products: [{ product_id: 'PROD-002', brand_name: 'DrugY', active_substances: ['SubstanceY'] }]
    },
    {
      pmid: '12345680',
      title: 'In vitro binding of DrugZ',
      abstract: 'We studied the binding affinity of DrugZ to receptor Y in vitro using cell lines.',
      journal: 'Pharmacology Journal',
      publication_date: '2024-03-01',
      language: 'en',
      chemicals: ['DrugZ'],
      publication_types: ['In Vitro'],
      matched_products: [{ product_id: 'PROD-003', brand_name: 'DrugZ', active_substances: ['SubstanceZ'] }]
    },
    {
      pmid: '12345681',
      title: 'Cardiac safety of DrugA',
      abstract: 'A 65-year-old male developed QT prolongation after DrugA therapy. ECG showed QTc 520ms. DrugA was discontinued.',
      journal: 'Cardiology Journal',
      publication_date: '2024-04-01',
      language: 'en',
      chemicals: ['DrugA'],
      publication_types: ['Case Report'],
      matched_products: [{ product_id: 'PROD-004', brand_name: 'DrugA', active_substances: ['SubstanceA'] }]
    },
    {
      pmid: '12345682',
      title: 'DrugB and nephrotoxicity',
      abstract: 'A 55-year-old female developed acute kidney injury after 2 weeks of DrugB therapy. Creatinine increased from 1.0 to 3.5 mg/dL.',
      journal: 'Nephrology Journal',
      publication_date: '2024-05-01',
      language: 'en',
      chemicals: ['DrugB'],
      publication_types: ['Case Report'],
      matched_products: [{ product_id: 'PROD-005', brand_name: 'DrugB', active_substances: ['SubstanceB'] }]
    }
  ];
});

// ============================================================================
// CUSTOM METRICS
// ============================================================================

const errorRate = new Rate('errors');
const requestDuration = new Trend('request_duration');
const throughput = new Counter('throughput');
const errors = new Counter('errors_total');
const stageErrors = new Counter('stage_errors');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

export const options = {
  // Test scenarios
  scenarios: {
    // Baseline - normal load
    baseline: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      tags: { test_type: 'baseline' },
    },
    // Stress - gradual ramp up
    stress: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '5m', target: 50 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'stress' },
    },
    // Spike - sudden burst
    spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 10 },
        { duration: '1m', target: 0 },
      ],
      tags: { test_type: 'spike' },
    },
    // Soak - sustained load
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
      tags: { test_type: 'soak' },
    },
    // Chaos - with failure injection
    chaos: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '5m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      tags: { test_type: 'chaos' },
    },
  },

  // Thresholds
  thresholds: {
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
    'http_req_failed': ['rate<0.05'],
    'errors': ['rate<0.05'],
    'stage_errors': ['rate<0.1'],
    'http_req_duration{test_type:baseline}': ['p(95)<3000'],
    'http_req_duration{test_type:stress}': ['p(95)<10000'],
    'http_req_duration{test_type:spike}': ['p(95)<15000'],
    'checks{test_type:baseline}': ['rate>0.95'],
    'checks{test_type:stress}': ['rate>0.90'],
  },

  // Export metrics
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  summaryTimeUnit: 'ms',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRandomArticle() {
  return testArticles[Math.floor(Math.random() * testArticles.length)];
}

function buildScreeningRequest(article) {
  return {
    article: {
      pmid: article.pmid,
      title: article.title,
      abstract: article.abstract,
      journal: article.journal,
      publication_date: article.publication_date,
      language: article.language,
      mesh_terms: article.mesh_terms,
      chemicals: article.chemicals,
      publication_types: article.publication_types,
      full_text: article.full_text,
    },
    matched_products: article.matched_products,
  };
}

function executeStage(baseUrl, stage, payload) {
  const startTime = new Date();
  const response = http.post(`${baseUrl}/api/v1/stages/${stage}`, JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': `k6-${__VU}-${__ITER}`,
    },
    timeout: '30s',
  });
  const duration = new Date() - startTime;
  return { response, duration };
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

export default function() {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
  const testType = __ENV.TEST_TYPE || 'baseline';
  const chaosMode = __ENV.CHAOS_MODE === 'true';

  // Select random article
  const article = getRandomArticle();
  const screeningPayload = buildScreeningRequest(article);

  // Track overall request
  const startTime = new Date();

  // ========================================================================
  // STAGE 1: Product Gate (fast, deterministic)
  // ========================================================================
  let stage1Response = executeStage(baseUrl, 'product-gate', {
    article: {
      pmid: article.pmid,
      title: article.title,
      abstract: article.abstract,
      journal: article.journal,
      publication_date: article.publication_date,
      language: article.language,
      mesh_terms: article.mesh_terms,
      chemicals: article.chemicals,
      publication_types: article.publication_types,
    },
    matched_products: article.matched_products,
  });

  const stage1Duration = new Date() - startTime;
  requestDuration.add(stage1Duration);
  throughput.add(1);

  const stage1Success = check(stage1Response.response, {
    'stage 1: status 200': (r) => r.status === 200,
    'stage 1: has decision': (r) => r.json().decision !== undefined,
  });

  if (!stage1Success) {
    errorRate.add(1);
    stageErrors.add(1);
    errors.add(1);
    return; // Early exit on product gate failure
  }

  const stage1Decision = stage1Response.response.json().decision;

  // Early exit for non-clinical/non-product
  if (stage1Decision === 'EXCLUDE_NON_CLINICAL' || stage1Decision === 'IRRELEVANT_NON_PRODUCT') {
    return;
  }

  // ========================================================================
  // STAGE 2: Screening (with translation if needed)
  // ========================================================================
  const stage2Response = executeStage(baseUrl, 'screening', {
    article: {
      pmid: article.pmid,
      title: article.title,
      abstract: article.abstract,
      journal: article.journal,
      publication_date: article.publication_date,
      language: article.language,
      mesh_terms: article.mesh_terms,
      chemicals: article.chemicals,
      publication_types: article.publication_types,
      full_text: article.full_text,
    },
    matched_products: article.matched_products,
    full_text: article.full_text,
    journal: article.journal,
    publication_date: article.publication_date,
  });

  const stage2Duration = new Date() - startTime - stage1Duration;
  requestDuration.add(stage2Duration);

  const stage2Success = check(stage2Response.response, {
    'stage 2: status 200': (r) => r.status === 200,
    'stage 2: has decision': (r) => r.json().decision !== undefined,
    'stage 2: has confidence': (r) => r.json().confidence !== undefined,
  });

  if (!stage2Success) {
    errorRate.add(1);
    stageErrors.add(1);
    errors.add(1);
  }

  const screeningOutput = stage2Response.response.json();
  const screeningDecision = screeningOutput.decision;

  // ========================================================================
  // STAGE 3-7: Case Processing (if case data available)
  // ========================================================================
  if (screeningDecision === 'INCLUDE' || screeningDecision === 'REVIEW' || screeningDecision === 'SERIOUS') {
    // For load testing, we simulate case processing
    // In production, this would chain through agents 3-9

    // Simulate medical history extraction
    executeStage(baseUrl, 'medical-history', {
      case_id: `case-${Date.now()}`,
      narrative: 'Patient with history of hypertension and diabetes developed adverse reaction.',
      structured_fields: { age: '45Y', sex: 'MALE', weight: '80kg' },
    });

    // Simulate action taken
    executeStage(baseUrl, 'action-taken', {
      case_id: `case-${Date.now()}`,
      drug_exposure: { drug_name: 'DrugX', dose: '100mg', route: 'ORAL', therapy_start: '2024-01-01', action_taken: 'DRUG_WITHDRAWN' },
      adverse_event: { meddra_llt: 'Hepatotoxicity', onset_date: '2024-01-15', outcome: 'RECOVERED', seriousness: 'SERIOUS' },
    });

    // Simulate dechallenge
    executeStage(baseUrl, 'dechallenge', {
      case_id: `case-${Date.now()}`,
      drug_exposure: { drug_name: 'DrugX', therapy_start: '2024-01-01', therapy_end: '2024-01-20', action_taken: 'DRUG_WITHDRAWN' },
      adverse_event: { meddra_llt: 'Hepatotoxicity', onset_date: '2024-01-15', end_date: '2024-01-30', outcome: 'RECOVERED' },
    });

    // Simulate rechallenge
    executeStage(baseUrl, 'rechallenge', {
      case_id: `case-${Date.now()}`,
      drug_exposure: { drug_name: 'DrugX', dose: '100mg', route: 'ORAL', therapy_start: '2024-01-01', therapy_end: '2024-01-20', rechallenge_dose: '100mg', rechallenge_route: 'ORAL' },
      adverse_event: { meddra_llt: 'Hepatotoxicity', onset_date: '2024-01-15' },
      rechallenge_info: { rechallenge_done: true, event_recurred: true, recurrence_event_same: true, time_to_recurrence_days: 5 },
    });

    // Simulate causality
    executeStage(baseUrl, 'causality', {
      case_id: `case-${Date.now()}`,
      case: {
        case_id: `case-${Date.now()}`,
        drug: { name: 'DrugX', active_substance: 'SubstanceX', dose: '100mg', route: 'ORAL', therapy_start: '2024-01-01', therapy_end: '2024-01-20' },
        event: { meddra_llt: 'Hepatotoxicity', onset_date: '2024-01-15', outcome: 'RECOVERED', seriousness: 'SERIOUS' },
        dechallenge: { done: true, result: 'POSITIVE', time_to_improvement_days: 10 },
        rechallenge: { done: true, result: 'POSITIVE', time_to_recurrence_days: 5, same_event: true, dose_comparison: 'SAME' },
      },
      trace_id: `trc-${Date.now()}`,
      tenant_id: 'k6-test',
    });
  }

  // ========================================================================
  // CHAOS ENGINEERING: Inject failures
  // ========================================================================
  if (chaosMode && Math.random() < 0.1) {
    // Randomly inject failure
    const chaosAction = Math.floor(Math.random() * 4);
    switch (chaosAction) {
      case 0:
        // Simulate timeout
        sleep(Math.random() * 30 + 10);
        break;
      case 1:
        // Return early without completing
        return;
      case 2:
        // Inject error
        errorRate.add(1);
        errors.add(1);
        break;
      case 3:
        // Simulate circuit breaker open
        sleep(5000);
        break;
    }
  }

  // Record total duration
  const totalDuration = new Date() - startTime;
  requestDuration.add(totalDuration);

  // Final checks
  check(true, {
    'total duration < 60s': () => totalDuration < 60000,
    'total duration < 30s (baseline)': () => testType !== 'baseline' || totalDuration < 30000,
  });

  // Small sleep between iterations
  sleep(Math.random() * 2 + 0.5);
}

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

export function setup() {
  console.log('Starting k6 load test for NEXUS Agent Pools');
  console.log(`Test type: ${__ENV.TEST_TYPE || 'baseline'}`);
  console.log(`Base URL: ${__ENV.BASE_URL || 'http://localhost:8080'}`);
  console.log(`Chaos mode: ${__ENV.CHAOS_MODE || 'false'}`);
}

export function teardown(data) {
  console.log('k6 load test completed');
  console.log('Check Grafana dashboards for detailed metrics');
}