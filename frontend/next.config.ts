import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId: process.env.BUILD_SHA,
  poweredByHeader: false,
};

export default nextConfig;
