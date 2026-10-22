export function isHitsFrsPreviewEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const localPreview = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FORCE_HITS_FRS === "true";
  const vercelPreview = process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  return localPreview || vercelPreview;
}
