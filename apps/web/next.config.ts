import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mcqs/shared"],
  output: "standalone",
};

export default nextConfig;
