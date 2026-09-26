import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { heartbeatSchema, HEARTBEAT_RETENTION_DAYS } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrunedAt = 0;

/** Constant-time comparison; hashing first makes the lengths equal. */
function tokenMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientIp(request: Request) {
  // Traefik appends the real client address to X-Forwarded-For.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function POST(request: Request) {
  const expected = process.env.HEARTBEAT_TOKEN;
  if (!expected) {
    return Response.json({ error: "heartbeat disabled" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!given || !tokenMatches(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const status = parsed.data;
  const now = new Date();
  const fields = {
    hostname: status.hostname,
    profile: status.profile ?? null,
    computerType: status.computerType ?? null,
    computerName: status.computerName ?? null,
    lastSeenAt: now,
    lastIp: clientIp(request),
    status,
  };

  await db.$transaction([
    db.computer.upsert({
      where: { host: status.host },
      create: { host: status.host, ...fields },
      update: fields,
    }),
    db.heartbeat.create({ data: { host: status.host, receivedAt: now, status } }),
  ]);

  if (now.getTime() - lastPrunedAt > PRUNE_INTERVAL_MS) {
    lastPrunedAt = now.getTime();
    const cutoff = new Date(now.getTime() - HEARTBEAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.heartbeat.deleteMany({ where: { receivedAt: { lt: cutoff } } });
  }

  return Response.json({ ok: true });
}
