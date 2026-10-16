// Staging supervisor entrypoint; fail closed until approved provider adapter is installed.
import { startNexusNativeWorker } from '../lib/server/start-native-agent-worker';
import type { AIProvider } from '../lib/ai/ai-types';
import { createApprovedNativeCOIProvider } from '../lib/server/native-coi-provider';

const ipcSigningSecret = process.env.IPC_SIGNING_SECRET;
const socketPath = process.env.NEXUS_NATIVE_SOCKET_PATH || '/run/nexus-agents/agent.sock';
if (!ipcSigningSecret || Buffer.byteLength(ipcSigningSecret)<32)
  throw new Error('IPC_SIGNING_SECRET missing or too short');
if (process.env.NEXUS_PV_AGENTS_ENABLED !== 'false')
  throw new Error('Clinical agent execution must be disabled');
const countryProvider: AIProvider = createApprovedNativeCOIProvider();
await startNexusNativeWorker({socketPath,ipcSigningSecret,countryProvider});
