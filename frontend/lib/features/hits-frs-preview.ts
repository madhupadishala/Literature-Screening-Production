/** This gate never bypasses authentication or API authorization. */
export function isHitsFrsPreviewEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "feature/nexus-hits-frs-integration";
}
