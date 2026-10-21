import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow isolated production profiling without overwriting the active dev build.
  distDir: process.env.JOTA_NEXT_DIST_DIR || ".next",
  experimental: {
    // Profile images are capped at 5 MB; leave a small margin for multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
