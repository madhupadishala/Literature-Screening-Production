import { createLiteratureDuplicatesAgent } from './lib/agents/agent-1-literature-duplicates';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createLiteratureDuplicatesAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  // Test Author-Year Fuzzy Match case
  const input = {
    correlation_id: 'test',
    trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
    payload: {
      records: [
        {
          title: "Cardiotoxicity of DrugX in Clinical Practice",
          abstract: "Review of cardiac adverse events with DrugX",
          authors: ["Johnson M", "Williams R"],
          publication_year: 2023,
          source: "PUBMED",
          source_id: "pubmed-333"
        },
        {
          title: "Cardiac Toxicity of DrugX: Clinical Experience",
          abstract: "Clinical experience with DrugX cardiotoxicity",
          authors: ["Johnson M", "Davis K"],
          publication_year: 2023,
          source: "EMBASE",
          source_id: "embase-444"
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