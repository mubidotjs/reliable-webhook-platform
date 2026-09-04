import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@rwp/config", "@rwp/contracts", "@rwp/domain"],
};

export default nextConfig;
