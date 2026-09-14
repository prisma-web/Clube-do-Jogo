import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the long-running local preview isolated while preserving Next's
  // standard production output, which Vercel expects at `.next`.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@clube-do-jogo/domain", "@clube-do-jogo/data"],
  typescript: {
    tsconfigPath: "tsconfig.web.json",
  },
};

export default nextConfig;
