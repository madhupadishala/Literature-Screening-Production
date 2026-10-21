/**
 * Gates the approved Hits FRS UI in isolated NEXUS preview deployments.
 * This gate does NOT bypass authentication or tenant/client authorization.
 * Keep all data operations behind the existing authenticated server APIs.
 */
export function isHitsFrsPreviewEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview"
    && process.env.NEXUS_HITS_FRS_PREVIEW_ENABLED === "true";
}
