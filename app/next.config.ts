import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The database drivers load native and WebAssembly files at runtime, so they stay outside the bundle.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
