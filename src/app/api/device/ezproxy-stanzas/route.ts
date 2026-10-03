import { checkDeviceAuth } from "@/lib/device-auth";
import { getEzproxyStanzas } from "@/lib/ezproxy";

export const dynamic = "force-dynamic";

/**
 * Open guest computers fetch the EZproxy stanza file here (allowlist_from_ezproxy.sh),
 * with the device token, instead of from GitHub with a token of their own.
 * 503 = not available; the computer then keeps its cached copy.
 */
export async function GET(request: Request) {
  const denied = checkDeviceAuth(request);
  if (denied) return denied;

  const stanzas = await getEzproxyStanzas();
  if (!stanzas) return Response.json({ error: "stanza file not available" }, { status: 503 });

  return new Response(stanzas.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(stanzas.stale ? { "X-Stanzas-Stale": "1" } : {}),
    },
  });
}
