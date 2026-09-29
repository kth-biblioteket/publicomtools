import "server-only";
import { db } from "@/lib/db";
import { heartbeatSchema, type HeartbeatStatus } from "@/lib/heartbeat";
import { evaluate, type Evaluation } from "@/lib/status";

/**
 * Whether the computer runs the settings in this admin:
 * - legacy:  it has never fetched config from here (still on the GitHub .config files)
 * - pending: settings affecting it changed after it last fetched them (at boot)
 * - current: it runs what the admin shows
 */
export type ConfigState = "legacy" | "pending" | "current";

export type ComputerView = {
  host: string;
  hostname: string;
  profile: string | null;
  computerName: string | null;
  lastSeenAt: Date;
  lastIp: string | null;
  status: HeartbeatStatus | null;
  evaluation: Evaluation;
  secondsSinceSeen: number;
  configState: ConfigState;
  configFetchedAt: Date | null;
};

type ComputerRow = {
  host: string;
  hostname: string;
  profile: string | null;
  computerName: string | null;
  lastSeenAt: Date;
  lastIp: string | null;
  status: unknown;
  configFetchedAt?: Date | null;
  configUpdatedAt?: Date | null;
};

/** When each layer last changed: base, and every profile by name. */
export type LayerTimes = { base: Date | null; profiles: Map<string, Date> };

const SEVERITY = { offline: 0, warning: 1, ok: 2 } as const;

export async function getLayerTimes(): Promise<LayerTimes> {
  const layers = await db.configLayer.findMany({ select: { kind: true, name: true, updatedAt: true } });
  const base = layers.find((l) => l.kind === "base")?.updatedAt ?? null;
  const profiles = new Map(layers.filter((l) => l.kind === "profile").map((l) => [l.name, l.updatedAt]));
  return { base, profiles };
}

function configState(c: ComputerRow, times?: LayerTimes): ConfigState {
  if (!c.configFetchedAt) return "legacy";
  if (!times) return "current";
  const changed = [times.base, c.profile ? times.profiles.get(c.profile) : null, c.configUpdatedAt]
    .filter((d): d is Date => !!d)
    .some((d) => d > c.configFetchedAt!);
  return changed ? "pending" : "current";
}

/** Stored payloads are re-validated on read, so a malformed row shows up as
 * a warning instead of breaking the page. */
export function toView(computer: ComputerRow, times?: LayerTimes, now = new Date()): ComputerView {
  const parsed = heartbeatSchema.safeParse(computer.status);
  const status = parsed.success ? parsed.data : null;
  const evaluation: Evaluation = status
    ? evaluate(computer.lastSeenAt, status, now)
    : {
        health: "warning",
        problems: [{ text: "Datorn har inte rapporterat någon status än", hint: "Den visas när den skickat sin första statusrapport." }],
      };
  const secondsSinceSeen = (now.getTime() - computer.lastSeenAt.getTime()) / 1000;
  return {
    host: computer.host,
    hostname: computer.hostname,
    profile: computer.profile,
    computerName: computer.computerName,
    lastSeenAt: computer.lastSeenAt,
    lastIp: computer.lastIp,
    status,
    evaluation,
    secondsSinceSeen,
    configState: configState(computer, times),
    configFetchedAt: computer.configFetchedAt ?? null,
  };
}

export async function listComputers(): Promise<ComputerView[]> {
  const [rows, times] = await Promise.all([db.computer.findMany({ orderBy: { host: "asc" } }), getLayerTimes()]);
  return rows
    .map((row) => toView(row, times))
    .sort((a, b) => SEVERITY[a.evaluation.health] - SEVERITY[b.evaluation.health] || a.host.localeCompare(b.host));
}

export async function getComputerView(host: string): Promise<ComputerView | null> {
  const [row, times] = await Promise.all([db.computer.findUnique({ where: { host } }), getLayerTimes()]);
  return row ? toView(row, times) : null;
}
