/** Local synthetic qualification only. Invokes genuine engines with an explicit provider fixture. */
import { readFileSync } from 'node:fs';
import { registerRecoveredNativeAgents } from '../../lib/server/native-agent-handlers';
import type { AIProvider } from '../../lib/ai/ai-types';
async function main() {
  if (process.env.NEXUS_SYNTHETIC_QUALIFICATION !== 'true') throw new Error('Synthetic qualification only');
  const request = JSON.parse(readFileSync(0, 'utf8'));
  if (!request.document_id?.startsWith('SYN-') || request.tenant_id !== 'nexus-staging-tenant' || request.client_id !== 'nexus-staging-client') throw new Error('Synthetic scope required');
  const provider: AIProvider = { provider: 'ollama', async complete() {
    return { provider: 'ollama', model: 'synthetic-fixture-no-model-call', content: JSON.stringify({ candidates: [], eventIds: [], incomplete: true }),
      finishReason: 'stop', latencyMs: 0, generatedAt: new Date().toISOString(), requestId: 'SYN-ONLY', attempts: 1 };
  }};
  const handlers = registerRecoveredNativeAgents({ countryProvider: provider });
  const result = await handlers[request.agent_id](request);
  process.stdout.write(JSON.stringify(result));
}
main().catch(() => { process.stderr.write('Synthetic native engine failed\n'); process.exitCode = 1; });
