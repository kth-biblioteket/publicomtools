import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // PubLiPlayer (Tizen-skärmarnas spelare) i public/player, en tillfällig kopia av publiplayer
  // (commit dae9651) tills repot kth-biblioteket/publiplayer finns; ändra den inte här, kopiera på
  // nytt. Skärmens URL Launcher: <värd>/publicomtools/player/index.html. /player leder dit, så att
  // sidans relativa länkar (css/…, js/…) fungerar, och nya versioner når skärmen utan cache
  async redirects() {
    return [{ source: "/player", destination: "/player/index.html", permanent: false }];
  },
  async headers() {
    return [
      { source: "/player/:path*", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // Installationsmappen för Samsungs URL Launcher (SSSP): skärmen hämtar sssp_config.xml och
      // PubLiPlayer.wgt från mappen. Tillfälligt prov med ett osignerat paket (publiplayer 0.1.4).
      {
        source: "/player-install/sssp_config.xml",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "text/xml; charset=utf-8" },
        ],
      },
      {
        source: "/player-install/PubLiPlayer.wgt",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
    ];
  },
};

export default nextConfig;
