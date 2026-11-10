import { createLiteratureDuplicatesAgent } from './lib/agents/agent-1-literature-duplicates';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createLiteratureDuplicatesAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  // Test SimHash case
  const input = {
    correlation_id: 'test',
    trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
    payload: {
      records: [
        {
          title: "Hepatotoxicity Associated with DrugX Treatment",
          abstract: "A 45-year-old patient developed severe hepatotoxicity after 3 weeks of DrugX therapy",
          authors: ["Smith J", "Brown T"],
          publication_year: 2024,
          source: "PUBMED",
          source_id: "pubmed-111"
        },
        {
          title: "DrugX-Induced Hepatotoxicity: A Case Report",
          abstract: "A 45-year-old patient developed severe hepatotoxicity after three weeks of DrugX therapy",
          authors: ["Smith J", "Brown T"],
          publication_year: 2024,
          source: "EMBASE",
          source_id: "embase-222"
        }
      ],
      similarity_threshold: 0.85,
      enable_fuzzy_matching: true
    }
  };

  const result = await agent.execute(input);
  console.log('Output:', JSON.stringify(result.output, null, 2));
}

main().catch(console.error);