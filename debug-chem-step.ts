import { createLiteratureDuplicatesAgent } from './lib/agents/agent-1-literature-duplicates';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createLiteratureDuplicatesAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  // Test step by step
  console.log('Step 1: Testing with empty records...');
  try {
    const input1 = {
      correlation_id: 'test',
      trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
      payload: {
        records: [],
        similarity_threshold: 0.6,
        enable_fuzzy_matching: true
      }
    };
    const result1 = await agent.execute(input1);
    console.log('Empty records - Success:', result1.success);
    console.log('Output:', JSON.stringify(result1.output));
  } catch (e) {
    console.error('Empty records error:', e);
  }

  console.log('\nStep 2: Testing with single record...');
  try {
    const input2 = {
      correlation_id: 'test',
      trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
      payload: {
        records: [
          {
            title: "DrugX and Liver Injury",
            abstract: "Study of DrugX hepatotoxicity",
            chemicals: ["DrugX", "MetaboliteY"],
            source: "PUBMED",
            source_id: "pubmed-555"
          }
        ],
        similarity_threshold: 0.6,
        enable_fuzzy_matching: true
      }
    };
    const result2 = await agent.execute(input2);
    console.log('Single record - Success:', result2.success);
    console.log('Output:', JSON.stringify(result2.output, null, 2));
  } catch (e) {
    console.error('Single record error:', e);
  }

  console.log('\nStep 3: Testing with two records...');
  try {
    const input3 = {
      correlation_id: 'test',
      trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
      payload: {
        records: [
          {
            title: "DrugX and Liver Injury",
            abstract: "Study of DrugX hepatotoxicity",
            chemicals: ["DrugX", "MetaboliteY"],
            source: "PUBMED",
            source_id: "pubmed-555"
          },
          {
            title: "MetaboliteY Role in DrugX Toxicity",
            abstract: "Mechanism of MetaboliteY in DrugX-induced injury",
            chemicals: ["DrugX", "MetaboliteY", "CompoundZ"],
            source: "LOCAL",
            source_id: "local-002"
          }
        ],
        similarity_threshold: 0.6,
        enable_fuzzy_matching: true
      }
    };
    const result3 = await agent.execute(input3);
    console.log('Two records - Success:', result3.success);
    console.log('Output:', JSON.stringify(result3.output, null, 2));
  } catch (e) {
    console.error('Two records error:', e);
  }
}

main().catch(console.error);