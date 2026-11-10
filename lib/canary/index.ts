/**
 * Canary Module - Synthetic monitoring for Nexus agents
 *
 * Provides:
 * - Agent-specific canary runners
 * - Health check endpoints
 * - Alert evaluation
 */

export { Agent4Canary, createAgent4Canary, getGlobalCanary, startGlobalCanary, stopGlobalCanary } from './agent-4-canary';
export type { CanaryResult, CanaryConfig } from './agent-4-canary';