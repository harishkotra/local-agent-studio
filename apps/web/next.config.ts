import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@agent-studio/shared", "@agent-studio/orchestrator"],
};

export default nextConfig;
