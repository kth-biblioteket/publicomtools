import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Set only for a production Docker build served under a Traefik
  // PathPrefix (/publicomtools on apps.lib.kth.se). Must be set to the same
  // value both at build time (bakes basePath into asset URLs — see the
  // BASE_PATH build arg in Dockerfile) and at container runtime (`next
  // start` re-reads this config) — see BASE_PATH in docker-compose.yml.
  ...(process.env.BASE_PATH ? { basePath: process.env.BASE_PATH } : {}),
};

export default nextConfig;
