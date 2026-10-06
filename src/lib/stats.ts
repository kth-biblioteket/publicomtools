import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Användningsstatistik från Visit (besök som enheterna rapporterar) och DeviceDay (igångtid per
 * enhet och dag). Allt räknas i svensk tid: en dag, en veckodag och en timme är som på skylten.
 */

const TZ = "Europe/Stockholm";
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-06": the date in Sweden */
export function swedishDay(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date);
}

/** The instant when the Swedish day starts ("2026-10-06" → 2026-10-05T22:00:00Z in summer) */
export function swedishMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY_MS);
}

export const PERIODS = [
  { id: "7d", label: "7 dagar" },
  { id: "30d", label: "30 dagar" },
  { id: "termin", label: "Terminen" },
  { id: "12m", label: "12 månader" },
] as const;

export type Period = {
  id: string;
  label: string;
  /** First day, inclusive (Swedish date) */
  from: string;
  /** Day after the last, exclusive */
  to: string;
};

/**
 * The period from the address: ?period=7d|30d|termin|12m, or ?from=2026-09-01&to=2026-09-30
 * (both days included). Default 30 days up to and including today.
 */
export function resolvePeriod(params: { period?: string; from?: string; to?: string }, now = new Date()): Period {
  const today = swedishDay(now);
  const tomorrow = addDays(today, 1);
  const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  if (isDay(params.from) && isDay(params.to) && params.from! <= params.to!) {
    return { id: "custom", label: `${params.from} – ${params.to}`, from: params.from!, to: addDays(params.to!, 1) };
  }
  switch (params.period) {
    case "7d":
      return { id: "7d", label: "7 dagar", from: addDays(tomorrow, -7), to: tomorrow };
    case "12m":
      return { id: "12m", label: "12 månader", from: addDays(tomorrow, -365), to: tomorrow };
    case "termin": {
      // VT januari–juni, HT augusti–december; i juli gäller vårterminen som just slutat
      const [year, month] = today.split("-").map(Number);
      const autumn = month >= 8;
      const from = autumn ? `${year}-08-01` : `${year}-01-01`;
      const end = autumn ? `${year + 1}-01-01` : `${year}-07-01`;
      return { id: "termin", label: autumn ? `HT ${year}` : `VT ${year}`, from, to: end < tomorrow ? end : tomorrow };
    }
    default:
      return { id: "30d", label: "30 dagar", from: addDays(tomorrow, -30), to: tomorrow };
  }
}

/** The same number of days just before the period, for "jämfört med föregående period" */
export function previousPeriod(p: Period): Period {
  const n = daysBetween(p.from, p.to);
  return { id: "previous", label: "föregående period", from: addDays(p.from, -n), to: p.from };
}

export type StatsFilter = {
  platform?: string;
  profile?: string;
  host?: string;
};

function where(p: Period, f: StatsFilter, alias: "v" | "d") {
  const parts: Prisma.Sql[] =
    alias === "v"
      ? [Prisma.sql`v."startedAt" >= ${swedishMidnight(p.from)} AND v."startedAt" < ${swedishMidnight(p.to)}`]
      : [Prisma.sql`d."day" >= ${p.from}::date AND d."day" < ${p.to}::date`];
  const col = (name: string) => Prisma.raw(`${alias}."${name}"`);
  if (f.platform) parts.push(Prisma.sql`${col("platform")} = ${f.platform}`);
  if (f.profile === "none") parts.push(Prisma.sql`${col("profile")} IS NULL`);
  else if (f.profile) parts.push(Prisma.sql`${col("profile")} = ${f.profile}`);
  if (f.host) parts.push(Prisma.sql`${col("host")} = ${f.host}`);
  return Prisma.join(parts, " AND ");
}

export type Summary = {
  visits: number;
  usedSeconds: number;
  medianSeconds: number;
  onlineSeconds: number;
  /** usedSeconds / onlineSeconds, 0–1, null without online time */
  occupancy: number | null;
  devices: number;
};

export async function summary(p: Period, f: StatsFilter): Promise<Summary> {
  const [v] = await db.$queryRaw<{ visits: bigint; used: bigint | null; median: number | null }[]>`
    SELECT count(*) AS visits, sum(v."seconds") AS used,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY v."seconds") AS median
    FROM "Visit" v WHERE ${where(p, f, "v")}`;
  const [d] = await db.$queryRaw<{ online: bigint | null; devices: bigint }[]>`
    SELECT sum(d."onlineSeconds") AS online, count(DISTINCT d."host") AS devices
    FROM "DeviceDay" d WHERE ${where(p, f, "d")}`;
  const usedSeconds = Number(v.used ?? 0);
  const onlineSeconds = Number(d.online ?? 0);
  return {
    visits: Number(v.visits),
    usedSeconds,
    medianSeconds: Math.round(v.median ?? 0),
    onlineSeconds,
    occupancy: onlineSeconds > 0 ? Math.min(1, usedSeconds / onlineSeconds) : null,
    devices: Number(d.devices),
  };
}

export type HeatCell = { dow: number; hour: number; inUse: number };

/**
 * Weekday (1 = måndag) × hour: on average how many devices were in use, from how much of each
 * visit falls within each hour. Divided by how many times that weekday occurs in the period.
 */
export async function heatmap(p: Period, f: StatsFilter): Promise<HeatCell[]> {
  const rows = await db.$queryRaw<{ dow: number; hour: number; secs: number }[]>`
    WITH v AS (
      SELECT (v."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ} AS s,
             (v."endedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ} AS e
      FROM "Visit" v WHERE ${where(p, f, "v")} AND v."seconds" > 0
    )
    SELECT extract(isodow FROM h)::int AS dow, extract(hour FROM h)::int AS hour,
           sum(extract(epoch FROM least(v.e, h + interval '1 hour') - greatest(v.s, h)))::float AS secs
    FROM v CROSS JOIN LATERAL generate_series(date_trunc('hour', v.s), v.e, interval '1 hour') h
    WHERE h < v.e
    GROUP BY 1, 2`;
  const occurrences = new Array(8).fill(0);
  for (let day = p.from; day < p.to; day = addDays(day, 1)) {
    occurrences[new Date(`${day}T12:00:00Z`).getUTCDay() || 7]++;
  }
  return rows.map((r) => ({
    dow: r.dow,
    hour: r.hour,
    inUse: occurrences[r.dow] ? r.secs / (occurrences[r.dow] * 3600) : 0,
  }));
}

export type DayRow = { day: string; visits: number; seconds: number };

/** Visits and use per day, every day of the period (also those without visits) */
export async function perDay(p: Period, f: StatsFilter): Promise<DayRow[]> {
  const rows = await db.$queryRaw<{ day: string; visits: bigint; seconds: bigint }[]>`
    SELECT to_char((v."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
           count(*) AS visits, sum(v."seconds") AS seconds
    FROM "Visit" v WHERE ${where(p, f, "v")}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DayRow[] = [];
  for (let day = p.from; day < p.to; day = addDays(day, 1)) {
    const r = byDay.get(day);
    out.push({ day, visits: Number(r?.visits ?? 0), seconds: Number(r?.seconds ?? 0) });
  }
  return out;
}

export const DURATION_BUCKETS = [
  { label: "< 1 min", max: 60 },
  { label: "1–5 min", max: 5 * 60 },
  { label: "5–15 min", max: 15 * 60 },
  { label: "15–30 min", max: 30 * 60 },
  { label: "30–60 min", max: 60 * 60 },
  { label: "> 1 h", max: Infinity },
] as const;

/** How many visits fall in each of DURATION_BUCKETS */
export async function durations(p: Period, f: StatsFilter): Promise<number[]> {
  const rows = await db.$queryRaw<{ bucket: number; n: bigint }[]>`
    SELECT CASE WHEN v."seconds" < 60 THEN 0 WHEN v."seconds" < 300 THEN 1 WHEN v."seconds" < 900 THEN 2
                WHEN v."seconds" < 1800 THEN 3 WHEN v."seconds" < 3600 THEN 4 ELSE 5 END AS bucket,
           count(*) AS n
    FROM "Visit" v WHERE ${where(p, f, "v")}
    GROUP BY 1`;
  const out = DURATION_BUCKETS.map(() => 0);
  for (const r of rows) out[r.bucket] = Number(r.n);
  return out;
}

export type DeviceRow = {
  host: string;
  name: string;
  platform: string;
  profile: string | null;
  visits: number;
  usedSeconds: number;
  onlineSeconds: number;
  occupancy: number | null;
  /** Visits per day, for the sparkline */
  daily: number[];
  /** Online less than half the period: the numbers say little */
  littleData: boolean;
};

/** Every device that was running or used in the period, least used first */
export async function perDevice(p: Period, f: StatsFilter): Promise<DeviceRow[]> {
  const [online, used, daily] = await Promise.all([
    db.$queryRaw<{ host: string; online: bigint; platform: string; profile: string | null }[]>`
      SELECT d."host", sum(d."onlineSeconds") AS online,
             (array_agg(d."platform" ORDER BY d."day" DESC))[1] AS platform,
             (array_agg(d."profile" ORDER BY d."day" DESC))[1] AS profile
      FROM "DeviceDay" d WHERE ${where(p, f, "d")} GROUP BY 1`,
    db.$queryRaw<{ host: string; visits: bigint; used: bigint; platform: string; profile: string | null }[]>`
      SELECT v."host", count(*) AS visits, sum(v."seconds") AS used,
             (array_agg(v."platform" ORDER BY v."startedAt" DESC))[1] AS platform,
             (array_agg(v."profile" ORDER BY v."startedAt" DESC))[1] AS profile
      FROM "Visit" v WHERE ${where(p, f, "v")} GROUP BY 1`,
    db.$queryRaw<{ host: string; day: string; visits: bigint }[]>`
      SELECT v."host", to_char((v."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
             count(*) AS visits
      FROM "Visit" v WHERE ${where(p, f, "v")} GROUP BY 1, 2`,
  ]);
  const hosts = new Set([...online.map((r) => r.host), ...used.map((r) => r.host)]);
  const computers = await db.computer.findMany({
    where: { host: { in: [...hosts] } },
    select: { host: true, label: true, computerName: true },
  });
  const names = new Map(computers.map((c) => [c.host, c.label || c.computerName || c.host]));
  const days: string[] = [];
  for (let day = p.from; day < p.to; day = addDays(day, 1)) days.push(day);
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const dailyByHost = new Map<string, number[]>();
  for (const r of daily) {
    const arr = dailyByHost.get(r.host) ?? days.map(() => 0);
    const i = dayIndex.get(r.day);
    if (i !== undefined) arr[i] = Number(r.visits);
    dailyByHost.set(r.host, arr);
  }
  const periodSeconds = days.length * 24 * 3600;
  const onlineBy = new Map(online.map((r) => [r.host, r]));
  const usedBy = new Map(used.map((r) => [r.host, r]));
  const rows: DeviceRow[] = [...hosts].map((host) => {
    const o = onlineBy.get(host);
    const u = usedBy.get(host);
    const onlineSeconds = Number(o?.online ?? 0);
    const usedSeconds = Number(u?.used ?? 0);
    return {
      host,
      name: names.get(host) ?? host,
      platform: u?.platform ?? o?.platform ?? "linux",
      profile: u?.profile ?? o?.profile ?? null,
      visits: Number(u?.visits ?? 0),
      usedSeconds,
      onlineSeconds,
      occupancy: onlineSeconds > 0 ? Math.min(1, usedSeconds / onlineSeconds) : null,
      daily: dailyByHost.get(host) ?? days.map(() => 0),
      littleData: onlineSeconds < periodSeconds / 2,
    };
  });
  // Minst använda först; enheter med lite data sist, eftersom de inte går att jämföra
  return rows.sort(
    (a, b) => Number(a.littleData) - Number(b.littleData) || (a.occupancy ?? 0) - (b.occupancy ?? 0) || a.visits - b.visits,
  );
}

/** When the first visit was reported, for the empty state */
export async function firstVisitAt(): Promise<Date | null> {
  const first = await db.visit.findFirst({ orderBy: { startedAt: "asc" }, select: { startedAt: true } });
  return first?.startedAt ?? null;
}

/** Profiles (with their names in the admin) and platforms that occur in the statistics, for the filter */
export async function filterOptions(): Promise<{
  profiles: { value: string; label: string }[];
  platforms: string[];
  labels: Map<string, string>;
}> {
  const [rows, layers] = await Promise.all([
    db.$queryRaw<{ profile: string | null; platform: string }[]>`SELECT DISTINCT "profile", "platform" FROM "DeviceDay"`,
    db.configLayer.findMany({ where: { kind: "profile" }, select: { name: true, label: true } }),
  ]);
  const labels = new Map(layers.map((l) => [l.name, l.label || l.name]));
  const names = [...new Set(rows.map((r) => r.profile).filter((p): p is string => !!p))];
  return {
    profiles: names.map((n) => ({ value: n, label: labels.get(n) ?? n })).sort((a, b) => a.label.localeCompare(b.label, "sv")),
    platforms: [...new Set(rows.map((r) => r.platform))].sort(),
    labels,
  };
}

export type VisitRow = {
  id: string;
  host: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  seconds: number;
  reason: string | null;
  pages: number | null;
};

/** The visits of the period, newest first: the first `limit`, and how many there are in all */
export async function visitList(
  p: Period,
  f: StatsFilter,
  limit: number,
): Promise<{ visits: VisitRow[]; total: number }> {
  const where = {
    startedAt: { gte: swedishMidnight(p.from), lt: swedishMidnight(p.to) },
    ...(f.platform ? { platform: f.platform } : {}),
    ...(f.profile === "none" ? { profile: null } : f.profile ? { profile: f.profile } : {}),
    ...(f.host ? { host: f.host } : {}),
  };
  const [rows, total] = await Promise.all([
    db.visit.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: { computer: { select: { label: true, computerName: true } } },
    }),
    db.visit.count({ where }),
  ]);
  return {
    total,
    visits: rows.map((v) => ({
      id: v.id.toString(),
      host: v.host,
      name: v.computer.label || v.computer.computerName || v.host,
      startedAt: v.startedAt,
      endedAt: v.endedAt,
      seconds: v.seconds,
      reason: v.reason,
      pages: v.pages,
    })),
  };
}
