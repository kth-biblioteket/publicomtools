import { db } from "@/lib/db";
import { authenticateDevice, mayActFor } from "@/lib/device-auth";
import { heartbeatSchema, HEARTBEAT_RETENTION_DAYS, plausibleVisits, USAGE_RETENTION_DAYS } from "@/lib/heartbeat";
import { heartbeatInterval } from "@/lib/status";
import { swedishDay } from "@/lib/stats";
import { rebootPending, reloadPending, RELOAD_EXPIRES_MS, screenshotPending } from "@/lib/reload";
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

  // The visits go to their own table, not into the stored status
  const { visits: reportedVisits, ...status } = parsed.data;
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
    select: {
      platform: true,
      lastSeenAt: true,
      profile: true,
      configUpdatedAt: true,
      reloadRequestedAt: true,
      configFetchedAt: true,
      rebootRequestedAt: true,
      screenshotRequestedAt: true,
      pinUnlockRequestedAt: true,
      screenshot: { select: { takenAt: true } },
    },
  });
  const profile = existing?.configUpdatedAt ? existing.profile : (existing?.profile ?? status.profile ?? null);
  const platform = existing?.platform ?? status.platform ?? "linux";

  // Användningsstatistik: besöken som enheten rapporterar, och igångtiden sedan förra rapporten
  // (högst två intervall: en längre lucka betyder att enheten var avstängd eller utan nät)
  const visits = plausibleVisits(reportedVisits, now);
  if (reportedVisits && visits.length < reportedVisits.length)
    console.warn(`heartbeat ${status.host}: ${reportedVisits.length - visits.length} orimliga besök ignorerades`);
  const onlineSeconds = existing
    ? Math.round(Math.min((now.getTime() - existing.lastSeenAt.getTime()) / 1000, 2 * heartbeatInterval(status) * 60))
    : 0;

  await db.$transaction([
    db.computer.upsert({
      where: { host: status.host },
      create: { host: status.host, ...fields, profile },
      update: { ...fields, profile },
    }),
    db.heartbeat.create({ data: { host: status.host, receivedAt: now, status } }),
    db.visit.createMany({
      data: visits.map((v) => ({
        host: status.host,
        startedAt: new Date(v.start * 1000),
        endedAt: new Date(v.end * 1000),
        seconds: v.end - v.start,
        reason: v.reason ?? null,
        pages: v.pages ?? null,
        platform,
        profile,
      })),
      skipDuplicates: true,
    }),
    db.$executeRaw`
      INSERT INTO "DeviceDay" ("host", "day", "onlineSeconds", "platform", "profile")
      VALUES (${status.host}, ${swedishDay(now)}::date, ${onlineSeconds}, ${platform}, ${profile})
      ON CONFLICT ("host", "day") DO UPDATE SET
        "onlineSeconds" = "DeviceDay"."onlineSeconds" + EXCLUDED."onlineSeconds",
        "platform" = EXCLUDED."platform", "profile" = EXCLUDED."profile"`,
  ]);

  if (now.getTime() - lastPrunedAt > PRUNE_INTERVAL_MS) {
    lastPrunedAt = now.getTime();
    const cutoff = new Date(now.getTime() - HEARTBEAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.heartbeat.deleteMany({ where: { receivedAt: { lt: cutoff } } });
    const usageCutoff = new Date(now.getTime() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db.visit.deleteMany({ where: { startedAt: { lt: usageCutoff } } });
    await db.deviceDay.deleteMany({ where: { day: { lt: usageCutoff } } });
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

  // Android: "Ta skärmdump" until a newer one arrives; "Lås upp menyn" is sent once
  const screenshot = existing ? screenshotPending(existing, existing.screenshot?.takenAt ?? null, now) : false;
  let pinUnlock = false;
  const unlockAt = existing?.pinUnlockRequestedAt;
  if (unlockAt) {
    const { count } = await db.computer.updateMany({
      where: { host: status.host, pinUnlockRequestedAt: unlockAt },
      data: { pinUnlockRequestedAt: null, pinUnlockRequestedBy: null },
    });
    pinUnlock = count > 0 && now.getTime() - unlockAt.getTime() <= RELOAD_EXPIRES_MS;
  }

  // visitsAck: the visits are stored (or were duplicates), the device may forget them
  return Response.json({ ok: true, reload, reboot, screenshot, pinUnlock, visitsAck: reportedVisits !== undefined });
}
