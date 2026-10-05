import { db } from "@/lib/db";
import { authenticateDevice, mayActFor } from "@/lib/device-auth";
import { heartbeatSchema, HEARTBEAT_RETENTION_DAYS } from "@/lib/heartbeat";
import { rebootPending, reloadPending } from "@/lib/reload";
import { loadLayers, mergeLayers } from "@/lib/config";

export const dynamic = "force-dynamic";

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPrunedAt = 0;

function clientIp(request: Request) {
  // Traefik appends the real client address to X-Forwarded-For.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function POST(request: Request) {
  const auth = await authenticateDevice(request);
  if ("denied" in auth) return auth.denied;

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
  if (!(await mayActFor(auth.identity, status.host))) return Response.json({ error: "forbidden" }, { status: 403 });
  const now = new Date();
  const fields = {
    hostname: status.hostname,
    computerType: status.computerType ?? null,
    computerName: status.computerName ?? null,
    lastSeenAt: now,
    lastIp: clientIp(request),
    status,
  };

  // Profilen ägs av admin. Datorn rapporterar den profil den startade med (status.profile),
  // vilket släpar efter ett byte i admin tills nästa omstart. Därför fylls Computer.profile
  // från heartbeat bara för en dator som aldrig ställts in i admin (configUpdatedAt saknas) och
  // saknar profil. Har admin valt "Ingen profil" är det också ett val som ska stå kvar.
  const existing = await db.computer.findUnique({
    where: { host: status.host },
    select: { profile: true, configUpdatedAt: true, reloadRequestedAt: true, configFetchedAt: true, rebootRequestedAt: true },
  });
  const profile = existing?.configUpdatedAt ? existing.profile : (existing?.profile ?? status.profile ?? null);

  await db.$transaction([
    db.computer.upsert({
      where: { host: status.host },
      create: { host: status.host, ...fields, profile },
      update: { ...fields, profile },
    }),
    db.heartbeat.create({ data: { host: status.host, receivedAt: now, status } }),
  ]);

  if (now.getTime() - lastPrunedAt > PRUNE_INTERVAL_MS) {
    lastPrunedAt = now.getTime();
    const cutoff = new Date(now.getTime() - HEARTBEAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.heartbeat.deleteMany({ where: { receivedAt: { lt: cutoff } } });
  }

  // Commands from the admin, carried out by heartbeat.sh when nobody is using the computer:
  // reboot = "Starta om datorn" (publicom-reboot.service), reload = "Hämta nya inställningar nu"
  // (publicom-reload.service). A reboot also fetches the settings, so it wins.
  const bootedAt = new Date(now.getTime() - status.uptimeSeconds * 1000);
  const reboot = existing ? rebootPending(existing, bootedAt, now) : false;
  let applied: boolean | undefined;
  if (status.configVersion && existing?.reloadRequestedAt) {
    const layers = await loadLayers(status.host);
    applied = layers ? mergeLayers(layers).PUBLICOM_CONFIG_VERSION.value === status.configVersion : undefined;
  }
  const reloadOpen = existing ? reloadPending(existing, now, applied) : false;
  const reload = !reboot && reloadOpen;

  // A request that is done (or expired) is cleared, so the admin can ask again after the next
  // change and a later change doesn't revive an old request. Only if nobody asked again meanwhile.
  if (existing?.reloadRequestedAt && !reloadOpen)
    await db.computer.updateMany({
      where: { host: status.host, reloadRequestedAt: existing.reloadRequestedAt },
      data: { reloadRequestedAt: null, reloadRequestedBy: null },
    });
  if (existing?.rebootRequestedAt && !reboot)
    await db.computer.updateMany({
      where: { host: status.host, rebootRequestedAt: existing.rebootRequestedAt },
      data: { rebootRequestedAt: null, rebootRequestedBy: null },
    });

  return Response.json({ ok: true, reload, reboot });
}
