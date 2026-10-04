import "server-only";
import { db } from "@/lib/db";
import { heartbeatSchema, type HeartbeatStatus } from "@/lib/heartbeat";
import { evaluate, type Evaluation } from "@/lib/status";
import { getProfileLabels } from "@/lib/profiles";
import { displayName } from "@/lib/names";
import { asValues, mergeLayers, type ConfigValues } from "@/lib/config";
import { rebootPending, reloadPending } from "@/lib/reload";

/**
 * Whether the computer runs the settings in this admin:
 * - new:     added in the admin and not installed yet (never fetched its config)
 * - legacy:  it has never fetched config from here (still on the GitHub .config files)
 * - pending: settings affecting it changed after it last fetched them (at boot)
 * - current: it runs what the admin shows
 */
export type ConfigState = "new" | "legacy" | "pending" | "current";

export type ComputerView = {
  host: string;
  hostname: string;
  profile: string | null;
  /** Display name of the profile */
  profileLabel: string | null;
  computerName: string | null;
  /** Admin-only name */
  label: string | null;
  /** label, else computerName, else host */
  name: string;
  lastSeenAt: Date;
  lastIp: string | null;
  status: HeartbeatStatus | null;
  evaluation: Evaluation;
  secondsSinceSeen: number;
  configState: ConfigState;
  configFetchedAt: Date | null;
  /** "Hämta nya inställningar nu" requested and not done yet */
  reloadRequestedAt: Date | null;
  /** "Starta om datorn" requested and the computer hasn't booted since */
  rebootRequestedAt: Date | null;
  /** Settings version the session runs (reported by newer computers), and the one it should run */
  runningVersion: string | null;
  expectedVersion: string | null;
};

type ComputerRow = {
  host: string;
  hostname: string;
  profile: string | null;
  computerName: string | null;
  label?: string | null;
  lastSeenAt: Date;
  lastIp: string | null;
  status: unknown;
  configFetchedAt?: Date | null;
  configUpdatedAt?: Date | null;
  addedBy?: string | null;
  overrides?: unknown;
  reloadRequestedAt?: Date | null;
  rebootRequestedAt?: Date | null;
};

/** When each layer last had a saved change: base, and every profile by name. */
export type LayerTimes = {
  base: Date | null;
  profiles: Map<string, Date>;
  labels?: Map<string, string>;
  /** Layer values, to work out the settings version each computer should run */
  values?: { base: ConfigValues; profiles: Map<string, ConfigValues> };
};

const SEVERITY = { offline: 0, warning: 1, ok: 2 } as const;

export async function getLayerTimes(): Promise<LayerTimes> {
  // The last saved change per layer (not ConfigLayer.updatedAt, which also moves on a rename).
  const [latest, labels, layers] = await Promise.all([
    db.configChange.groupBy({ by: ["target"], where: { NOT: { target: { startsWith: "host:" } } }, _max: { changedAt: true } }),
    getProfileLabels(),
    db.configLayer.findMany({ select: { kind: true, name: true, values: true } }),
  ]);
  const values = {
    base: asValues(layers.find((l) => l.kind === "base")?.values),
    profiles: new Map(layers.filter((l) => l.kind === "profile").map((l) => [l.name, asValues(l.values)])),
  };
  const base = latest.find((l) => l.target === "base")?._max.changedAt ?? null;
  const profiles = new Map(
    latest.filter((l) => l.target.startsWith("profile:") && l._max.changedAt).map((l) => [l.target.slice(8), l._max.changedAt!])
  );
  return { base, profiles, labels, values };
}

/** PUBLICOM_CONFIG_VERSION of the settings the admin wants this computer to run. */
export function expectedVersion(c: { host: string; profile: string | null; overrides?: unknown }, times?: LayerTimes): string | null {
  if (!times?.values) return null;
  const { base, profiles } = times.values;
  return mergeLayers({
    base,
    profile: c.profile ? { name: c.profile, values: profiles.get(c.profile) ?? {} } : null,
    host: { host: c.host, overrides: asValues(c.overrides) },
  }).PUBLICOM_CONFIG_VERSION.value;
}

function configState(c: ComputerRow, times: LayerTimes | undefined, running: string | undefined): ConfigState {
  // Newer computers report the settings version their session runs: exact answer.
  const expected = running ? expectedVersion(c, times) : null;
  if (running && expected) return running === expected ? "current" : "pending";
  // Older code: guess from when it last fetched its config.
  if (!c.configFetchedAt) return c.addedBy ? "new" : "legacy";
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
        problems: [
          computer.addedBy
            ? { text: "Väntar på installation", hint: "Installera datorn enligt docs/installera.md i publicom. Den hämtar sina inställningar härifrån och syns som OK efter första statusrapporten." }
            : { text: "Datorn har inte rapporterat någon status än", hint: "Den visas när den skickat sin första statusrapport." },
        ],
      };
  const secondsSinceSeen = (now.getTime() - computer.lastSeenAt.getTime()) / 1000;
  const state = configState(computer, times, status?.configVersion);
  return {
    host: computer.host,
    hostname: computer.hostname,
    profile: computer.profile,
    profileLabel: computer.profile ? times?.labels?.get(computer.profile) ?? computer.profile : null,
    computerName: computer.computerName,
    label: computer.label ?? null,
    name: displayName(computer),
    lastSeenAt: computer.lastSeenAt,
    lastIp: computer.lastIp,
    status,
    evaluation,
    secondsSinceSeen,
    configState: state,
    runningVersion: status?.configVersion ?? null,
    expectedVersion: expectedVersion(computer, times),
    configFetchedAt: computer.configFetchedAt ?? null,
    reloadRequestedAt: reloadPending(computer, now, status?.configVersion ? state === "current" : undefined)
      ? computer.reloadRequestedAt ?? null
      : null,
    rebootRequestedAt: rebootPending(computer, status ? new Date(computer.lastSeenAt.getTime() - status.uptimeSeconds * 1000) : null, now)
      ? computer.rebootRequestedAt ?? null
      : null,
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
