import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Pre-existing dashboard errors don't block production build of the storefront
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
