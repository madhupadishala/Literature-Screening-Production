import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId: process.env.BUILD_SHA,
  poweredByHeader: false,
  // The governed ClinixAI knowledge repository lives at the repository root,
  // one level above the Next.js app. Extend tracing to the monorepo root and
  // explicitly include those files in every server trace so Vercel functions
  // can verify and read KNOWLEDGE_ROOT at runtime.
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/*": ["../knowledge/**/*"],
  },
};

export default nextConfig;
