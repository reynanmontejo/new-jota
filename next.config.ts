import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Profile images are capped at 5 MB; leave a small margin for multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
