import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@clube-do-jogo/domain", "@clube-do-jogo/data"],
  typescript: {
    tsconfigPath: "tsconfig.web.json",
  },
};

export default nextConfig;
