import { checkDeviceAuth } from "@/lib/device-auth";
import { getEffectiveConfig, serializeEnv } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * The guest computer fetches its config here at boot (init.sh, as root), with the
 * device token. Returns base ⊕ profile ⊕ overrides in the env format load_config
 * parses. Config only, never secrets. Unknown host → 404 so the computer keeps its
 * last local config (safe_download fallback).
 */
export async function GET(request: Request) {
  const denied = checkDeviceAuth(request);
  if (denied) return denied;

  const host = new URL(request.url).searchParams.get("host") ?? "";
  if (!host) return Response.json({ error: "host required" }, { status: 400 });

  // Behind Traefik request.url can carry the container's own origin; build the
  // self-referencing REMOTE_CONFIG_URL from the host the computer actually used.
  const h = request.headers;
  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(request.url).host;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const origin = `${proto}://${forwardedHost}`;

  const values = await getEffectiveConfig(host, origin);
  if (!values) return Response.json({ error: "unknown host" }, { status: 404 });

  return new Response(serializeEnv(values), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
