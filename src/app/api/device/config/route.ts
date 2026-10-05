import { authenticateDevice, mayActFor } from "@/lib/device-auth";
import { db } from "@/lib/db";
import { getEffectiveConfig, serializeEnv } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The guest computer fetches its config here at boot (init.sh, as root), with the
 * device token. Returns base ⊕ profile ⊕ overrides in the env format load_config
 * parses. Config only, never secrets. Unknown host → 404 so the computer keeps its
 * last local config (safe_download fallback).
 *
 * Android tablets ask for JSON (Accept: application/json or ?format=json):
 * { values: {KEY: "value"}, version: PUBLICOM_CONFIG_VERSION }.
 */
export async function GET(request: Request) {
  const auth = await authenticateDevice(request);
  if ("denied" in auth) return auth.denied;

  const url = new URL(request.url);
  const host = url.searchParams.get("host") ?? "";
  if (!host) return Response.json({ error: "host required" }, { status: 400 });
  if (!(await mayActFor(auth.identity, host))) return Response.json({ error: "forbidden" }, { status: 403 });

  // Behind Traefik request.url can carry the container's own origin; build the
  // self-referencing REMOTE_CONFIG_URL from the host the computer actually used.
  const h = request.headers;
  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const origin = `${proto}://${forwardedHost}`;

  const values = await getEffectiveConfig(host, origin);
  if (!values) return Response.json({ error: "unknown host" }, { status: 404 });

  // Admin jämför med senaste ändring för att visa "väntar på omstart".
  await db.computer.update({ where: { host }, data: { configFetchedAt: new Date() } });

  if (url.searchParams.get("format") === "json" || (request.headers.get("accept") ?? "").includes("application/json"))
    return Response.json({ values, version: values.PUBLICOM_CONFIG_VERSION }, { headers: { "Cache-Control": "no-store" } });

  return new Response(serializeEnv(values), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
