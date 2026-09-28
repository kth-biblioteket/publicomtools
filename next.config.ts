import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trace only the files the running server needs into .next/standalone, so the
  // production image ships a minimal node_modules instead of the full install
  // (dev tooling, next build machinery, …). See Dockerfile's runner stage.
  output: "standalone",
  // The dev server blocks its dev-only assets for other origins than
  // localhost, which leaves every page without client JavaScript. The test
  // VMs in UTM reach the dev server on the Mac at 10.0.2.2. Dev only.
  allowedDevOrigins: ["10.0.2.2"],
  // Set only for a production Docker build served under a Traefik
  // PathPrefix (/publicomtools on apps.lib.kth.se). Must be set to the same
  // value both at build time (bakes basePath into asset URLs — see the
  // BASE_PATH build arg in Dockerfile) and at container runtime (`next
  // start` re-reads this config) — see BASE_PATH in docker-compose.yml.
  ...(process.env.BASE_PATH ? { basePath: process.env.BASE_PATH } : {}),
};

export default nextConfig;
