import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { withBasePath } from "@/lib/base-path";
import { asPlatform, baseName } from "@/lib/platforms";

/**
 * Guest computer configuration, served to the computers instead of the static
 * GitHub .config files. The effective config is base ⊕ profile ⊕ host overrides.
 * See docs/config-via-publicomtools.md in the publicom repo.
 *
 * Config only — never secrets (those stay in /usr/local/bin/secrets/.secrets on
 * each computer). Values are strings; the computer reads them with load_config
 * (printf -v, never source), so nothing here can execute code.
 */

export type ConfigValues = Record<string, string>;

export function asValues(json: unknown): ConfigValues {
  if (!json || typeof json !== "object") return {};
  const out: ConfigValues = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}

/** Where a key's effective value comes from. "auto" = identity keys added by the server. */
export type ConfigSource = "base" | "profile" | "host" | "auto";
export type EffectiveEntry = { value: string; source: ConfigSource };
export type EffectiveConfig = Record<string, EffectiveEntry>;

export type Layers = {
  base: ConfigValues;
  profile: { name: string; values: ConfigValues } | null;
  host: { host: string; overrides: ConfigValues };
};

/**
 * base ⊕ profile ⊕ host overrides, with the source of each value. Pure, so the admin
 * UI can run it on unsaved layers too (review before save).
 */
export function mergeLayers(layers: Layers, origin?: string): EffectiveConfig {
  const out: EffectiveConfig = {};
  const put = (values: ConfigValues, source: ConfigSource) => {
    for (const [k, value] of Object.entries(values)) out[k] = { value, source };
  };
  put(layers.base, "base");
  if (layers.profile) put(layers.profile.values, "profile");
  put(layers.host.overrides, "host");

  const { host } = layers.host;
  out.PUBLICOM_HOST = { value: host, source: "auto" };
  // heartbeat.sh skickar PUBLICOM_PROFILE tillbaka, så nya datorer får sin profil ifylld.
  if (layers.profile) out.PUBLICOM_PROFILE = { value: layers.profile.name, source: "auto" };
  // Version of these settings. The computer saves the version its session started with and
  // reports it in its heartbeat, so the admin can tell whether it runs what the admin shows.
  out.PUBLICOM_CONFIG_VERSION = { value: configVersion(entryValues(out)), source: "auto" };
  if (origin)
    out.REMOTE_CONFIG_URL = {
      value: `${origin}${withBasePath(`/api/device/config?host=${encodeURIComponent(host)}`)}`,
      source: "auto",
    };
  return out;
}

/**
 * A short hash of the settings a computer gets, independent of the address it fetched them
 * from (REMOTE_CONFIG_URL) and of the version key itself.
 */
export function configVersion(values: ConfigValues): string {
  const rest = Object.fromEntries(
    Object.entries(values).filter(([k]) => k !== "REMOTE_CONFIG_URL" && k !== "PUBLICOM_CONFIG_VERSION")
  );
  return createHash("sha256").update(serializeEnv(rest)).digest("hex").slice(0, 12);
}

export function entryValues(entries: EffectiveConfig): ConfigValues {
  return Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, e.value]));
}

/** The saved layers for one computer, or null for an unknown host. */
export async function loadLayers(host: string): Promise<Layers | null> {
  const computer = await db.computer.findUnique({ where: { host }, select: { profile: true, overrides: true, platform: true } });
  if (!computer) return null;
  const platform = asPlatform(computer.platform);

  const [base, profile] = await Promise.all([
    db.configLayer.findUnique({ where: { kind_name: { kind: "base", name: baseName(platform) } } }),
    computer.profile
      ? db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name: computer.profile } } })
      : Promise.resolve(null),
  ]);
  // A profile of another platform (should not happen: the admin only offers the computer's own) gives nothing
  const profileValues = profile && asPlatform(profile.platform) === platform ? asValues(profile.values) : {};

  return {
    base: asValues(base?.values),
    profile: computer.profile ? { name: computer.profile, values: profileValues } : null,
    host: { host, overrides: asValues(computer.overrides) },
  };
}

/** base ⊕ profile ⊕ host overrides, plus the identity keys the computer needs. */
export async function getEffectiveConfig(host: string, origin: string): Promise<ConfigValues | null> {
  const layers = await loadLayers(host);
  return layers ? entryValues(mergeLayers(layers, origin)) : null;
}

/**
 * Serialize to the env format the computers already parse (KEY="value" per line).
 * Values are double-quoted; load_config strips exactly one quote layer and assigns the rest
 * verbatim, so quotes inside a value are fine. Line breaks are rejected by validation.
 */
export function serializeEnv(values: ConfigValues): string {
  return (
    Object.keys(values)
      .sort()
      .map((k) => `${k}="${values[k]}"`)
      .join("\n") + "\n"
  );
}

export type EnumOption = { value: string; label: string };

/** ConfigKey.options (Json) as a typed list; tolerates a missing or malformed value. */
export function enumOptions(json: unknown): EnumOption[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((o): o is { value: unknown; label?: unknown } => !!o && typeof o === "object" && "value" in o)
    .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }));
}

// --- Admin reads/writes (see the (admin)/config pages) ---

export async function listProfiles(): Promise<string[]> {
  const rows = await db.configLayer.findMany({ where: { kind: "profile" }, select: { name: true }, orderBy: { name: "asc" } });
  return rows.map((r) => r.name);
}

export async function getComputerConfig(host: string) {
  const c = await db.computer.findUnique({
    where: { host },
    select: { host: true, computerName: true, profile: true, overrides: true },
  });
  if (!c) return null;
  return { host: c.host, computerName: c.computerName, profile: c.profile, overrides: asValues(c.overrides) };
}
