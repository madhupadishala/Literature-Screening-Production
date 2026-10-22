/** Trusted Node worker composition; no browser principal or clinical write route.
 * Actual handlers use recovered TS engines. The host must supply an approved COI
 * model and a non-persisting narrative draft function before opening its socket.
 */
import { createNativeBridge } from './native-agent-uds-bridge.mjs';
import { registerRecoveredNativeAgents } from './native-agent-handlers';
import type { AIProvider } from '../ai/ai-types';

export async function startNexusNativeWorker(input: {
  socketPath: string;
  countryProvider: AIProvider;
  ipcSigningSecret: string;
}) {
  if (process.env.NEXUS_PV_AGENTS_ENABLED === 'true') {
    throw new Error('Clinical dispatch release is not authorized for this isolated worker');
  }
  const handlers = registerRecoveredNativeAgents(input);
  if (Object.keys(handlers).length !== 5) throw new Error('Five native specialist registrations required');
  const server = createNativeBridge({socketPath:input.socketPath, handlers, signingSecret:input.ipcSigningSecret});
  await server.start();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.close();
  };
  const terminate = () => { void stop().finally(() => process.exit(0)); };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  return {handlers: Object.keys(handlers), stop};
}
