import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  // Local Node runtime; the filesystem and SQLite are never part of client bundles.
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingExcludes: { "*": ["./data/**/*", "./.env*"] },
  poweredByHeader: false,
};
export default config;
