import { createLiteratureDuplicatesAgent } from './lib/agents/agent-1-literature-duplicates';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createLiteratureDuplicatesAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  // Test with console logging inside the agent
  const input = {
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

  try {
    const result = await agent.execute(input);
    console.log('Success:', result.success);
    console.log('Error:', result.error);
    console.log('Output:', JSON.stringify(result.output, null, 2));
  } catch (e) {
    console.error('Exception:', e);
  }
}

main().catch(e => { console.error('Top-level error:', e); process.exit(1); });