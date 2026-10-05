import "server-only";
import { db } from "@/lib/db";
import { heartbeatSchema, type HeartbeatStatus } from "@/lib/heartbeat";
import { evaluate, type Evaluation } from "@/lib/status";
import { getProfileLabels } from "@/lib/profiles";
import { displayName } from "@/lib/names";
import { asValues, mergeLayers, type ConfigValues } from "@/lib/config";
import { rebootPending, reloadPending } from "@/lib/reload";
import { asPlatform, baseName, baseTargetPlatform, PLATFORMS, type Platform } from "@/lib/platforms";

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
  platform: Platform;
  /** Android: has its own device token (enrolled), and whether an enrollment code is waiting */
  enrolledAt: Date | null;
  enrollCodeExpiresAt: Date | null;
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
  platform?: string;
  enrolledAt?: Date | null;
  enrollExpiresAt?: Date | null;
  enrollCodeHash?: string | null;
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

/** When each layer last had a saved change: each platform's base, and every profile by name. */
export type LayerTimes = {
  base: Map<Platform, Date>;
  profiles: Map<string, Date>;
  labels?: Map<string, string>;
  /** Layer values, to work out the settings version each computer should run */
  values?: { base: Map<Platform, ConfigValues>; profiles: Map<string, ConfigValues>; profilePlatforms: Map<string, Platform> };
};

const SEVERITY = { offline: 0, warning: 1, ok: 2 } as const;

export async function getLayerTimes(): Promise<LayerTimes> {
  // The last saved change per layer (not ConfigLayer.updatedAt, which also moves on a rename).
  const [latest, labels, layers] = await Promise.all([
    db.configChange.groupBy({ by: ["target"], where: { NOT: { target: { startsWith: "host:" } } }, _max: { changedAt: true } }),
    getProfileLabels(),
    db.configLayer.findMany({ select: { kind: true, name: true, platform: true, values: true } }),
  ]);
  const profileLayers = layers.filter((l) => l.kind === "profile");
  const values = {
    base: new Map(PLATFORMS.map((p) => [p, asValues(layers.find((l) => l.kind === "base" && l.name === baseName(p))?.values)])),
    profiles: new Map(profileLayers.map((l) => [l.name, asValues(l.values)])),
    profilePlatforms: new Map(profileLayers.map((l) => [l.name, asPlatform(l.platform)])),
  };
  const base = new Map<Platform, Date>();
  for (const l of latest) {
    const p = baseTargetPlatform(l.target);
    if (p && l._max.changedAt) base.set(p, l._max.changedAt);
  }
  const profiles = new Map(
    latest.filter((l) => l.target.startsWith("profile:") && l._max.changedAt).map((l) => [l.target.slice(8), l._max.changedAt!])
  );
  return { base, profiles, labels, values };
}

/** PUBLICOM_CONFIG_VERSION of the settings the admin wants this computer to run. */
export function expectedVersion(
  c: { host: string; profile: string | null; overrides?: unknown; platform?: string },
  times?: LayerTimes
): string | null {
  if (!times?.values) return null;
  const { base, profiles, profilePlatforms } = times.values;
  const platform = asPlatform(c.platform);
  // Same rule as loadLayers: a profile of another platform contributes nothing
  const profileValues = c.profile && profilePlatforms.get(c.profile) === platform ? profiles.get(c.profile) ?? {} : {};
  return mergeLayers({
    base: base.get(platform) ?? {},
    profile: c.profile ? { name: c.profile, values: profileValues } : null,
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
  const changed = [times.base.get(asPlatform(c.platform)), c.profile ? times.profiles.get(c.profile) : null, c.configUpdatedAt]
    .filter((d): d is Date => !!d)
    .some((d) => d > c.configFetchedAt!);
  return changed ? "pending" : "current";
}

/** Stored payloads are re-validated on read, so a malformed row shows up as
 * a warning instead of breaking the page. */
export function toView(computer: ComputerRow, times?: LayerTimes, now = new Date()): ComputerView {
  const parsed = heartbeatSchema.safeParse(computer.status);
  const status = parsed.success ? parsed.data : null;
  const platform = asPlatform(computer.platform);
  const evaluation: Evaluation = status
    ? evaluate(computer.lastSeenAt, status, now)
    : {
        health: "warning",
        problems: [
          platform === "android"
            ? computer.enrolledAt
              ? { text: "Enheten har inte rapporterat någon status än", hint: "Den visas när appen skickat sin första statusrapport." }
              : { text: "Väntar på inskrivning", hint: "Öppna appens meny på enheten, välj Anslut till publicomtools och ange koden. En ny kod får du under Teknik." }
            : computer.addedBy
              ? { text: "Väntar på installation", hint: "Installera datorn enligt docs/installera.md i publicom. Den hämtar sina inställningar härifrån och syns som OK efter första statusrapporten." }
              : { text: "Datorn har inte rapporterat någon status än", hint: "Den visas när den skickat sin första statusrapport." },
        ],
      };
  const secondsSinceSeen = (now.getTime() - computer.lastSeenAt.getTime()) / 1000;
  const state = configState(computer, times, status?.configVersion);
  return {
    host: computer.host,
    hostname: computer.hostname,
    platform,
    enrolledAt: computer.enrolledAt ?? null,
    enrollCodeExpiresAt: computer.enrollCodeHash && computer.enrollExpiresAt && computer.enrollExpiresAt > now ? computer.enrollExpiresAt : null,
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
