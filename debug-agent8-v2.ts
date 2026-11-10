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
      caseId: 'MED-001',
      narrative: 'Patient has a history of hypertension and type 2 diabetes mellitus for 10 years. Also has atrial fibrillation diagnosed 2 years ago. Currently on metformin, lisinopril, and warfarin.',
      patient_section: '65-year-old male with history of HTN, DM2, AFib',
      structured_fields: { age: '65Y', sex: 'MALE', weight: '80kg' }
    }
  };

  const result = await agent.execute(input);
  console.log('Success:', result.success);
  console.log('Error:', result.error);
  if (result.output) {
    console.log('Conditions found:', result.output.medical_history?.conditions?.length || 0);
    console.log('Conditions:', JSON.stringify(result.output.medical_history?.conditions, null, 2));
    console.log('Confidence:', result.output.medical_history?.extraction_confidence);
  }
}

main().catch(console.error);