import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-studio/shared", "@agent-studio/orchestrator"],
};

export default nextConfig;
