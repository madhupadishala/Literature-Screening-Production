import { createLiteratureDuplicatesAgent } from './lib/agents/agent-1-literature-duplicates';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createLiteratureDuplicatesAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  // Test Exact PMID Match case
  const input = {
    correlation_id: 'test',
    trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
    payload: {
      records: [
        {
          pmid: "12345678",
          doi: "10.1000/test1",
          title: "Hepatotoxicity with DrugX",
          abstract: "Patient developed liver injury after DrugX administration",
          authors: ["Smith J", "Doe A"],
          journal: "Liver Journal",
          publication_date: "2024-01-15",
          publication_year: 2024,
          chemicals: ["DrugX"],
          source: "PUBMED",
          source_id: "pubmed-12345678"
        },
        {
          pmid: "12345678",
          doi: "10.1000/test2",
          title: "Hepatotoxicity with DrugX - Duplicate",
          abstract: "Patient developed liver injury after DrugX administration",
          authors: ["Smith J", "Doe A"],
          journal: "Liver Journal",
          publication_date: "2024-01-15",
          publication_year: 2024,
          chemicals: ["DrugX"],
          source: "EMBASE",
          source_id: "embase-12345678"
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