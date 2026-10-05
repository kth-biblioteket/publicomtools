import { z } from "zod";
import { enrollDevice } from "@/lib/enroll";

export const dynamic = "force-dynamic";

/**
 * An Android tablet (PubLiKiosk) exchanges the one-time code from the admin for its own device
 * token. No other authentication: the code is the secret. Failed attempts are rate limited per
 * client address.
 */
const bodySchema = z.object({ code: z.string().min(4).max(32) });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const now = Date.now();
  const f = failures.get(ip);
  if (f && f.resetAt > now && f.count >= MAX_FAILURES)
    return Response.json({ error: "för många försök, vänta en stund" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  const result = parsed.success ? await enrollDevice(parsed.data.code) : null;
  if (!result) {
    const entry = f && f.resetAt > now ? f : { count: 0, resetAt: now + WINDOW_MS };
    entry.count++;
    failures.set(ip, entry);
    if (failures.size > 1000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    return Response.json({ error: "okänd eller använd kod" }, { status: 403 });
  }
  failures.delete(ip);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
