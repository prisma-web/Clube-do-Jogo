import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the long-running local preview isolated while preserving Next's
  // standard production output, which Vercel expects at `.next`.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
