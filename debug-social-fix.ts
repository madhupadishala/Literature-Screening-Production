import { createMedicalHistoryAgent } from './lib/agents/agent-8-medical-history';
import { createLocalOnlyRouter } from './lib/infrastructure/hybrid-inference-router';
import { AuditLedgerService } from './lib/audit/audit-ledger-service';
import { ZDRStore } from './lib/infrastructure/redis-zdr-store';

async function main() {
  const router = createLocalOnlyRouter();
  const auditLedger = new AuditLedgerService({ host: 'localhost', port: 5432, database: 'nexus', user: 'postgres', password: 'postgres' });
  const zdrStore = new ZDRStore({ url: 'redis://localhost:6379' });

  const agent = createMedicalHistoryAgent({ tenant_id: 'eval-tenant', inference_router: router, audit_ledger: auditLedger, zdr_store: zdrStore });

  const input = {
    correlation_id: 'test',
    trace_context: { trace_id: 'test', span_id: 'test', tenant_id: 'eval-tenant' },
    payload: {
      caseId: "MED-004",
      narrative: "Patient is a former smoker with 20 pack-year history, quit 5 years ago. Occasional alcohol use. Works as a construction worker.",
      structured_fields: { age: "55Y", sex: "MALE" }
    }
  };

  const result = await agent.execute(input);
  console.log('Success:', result.success);
  console.log('Error:', result.error);
  if (result.output) {
    console.log('Social History:', JSON.stringify(result.output?.medical_history?.social_history, null, 2));
    console.log('Occupation:', result.output?.medical_history?.social_history?.occupation);
  }
}

main().catch(console.error);