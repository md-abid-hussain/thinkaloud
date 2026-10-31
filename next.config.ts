import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // pg loads optional native bindings at runtime, and the Daytona SDK requires form-data dynamically for uploads,
  // so both stay out of the server bundle.
  serverExternalPackages: ["pg", "@daytona/sdk"],
  // Dev only: 127.0.0.1 gets its own cookies, so the app can be checked as a fresh guest beside a localhost session.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
