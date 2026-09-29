import "server-only";
import { db } from "@/lib/db";
import { withBasePath } from "@/lib/base-path";

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

function asValues(json: unknown): ConfigValues {
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
  if (origin)
    out.REMOTE_CONFIG_URL = {
      value: `${origin}${withBasePath(`/api/device/config?host=${encodeURIComponent(host)}`)}`,
      source: "auto",
    };
  return out;
}

export function entryValues(entries: EffectiveConfig): ConfigValues {
  return Object.fromEntries(Object.entries(entries).map(([k, e]) => [k, e.value]));
}

/** The saved layers for one computer, or null for an unknown host. */
export async function loadLayers(host: string): Promise<Layers | null> {
  const computer = await db.computer.findUnique({ where: { host }, select: { profile: true, overrides: true } });
  if (!computer) return null;

  const [base, profile] = await Promise.all([
    db.configLayer.findUnique({ where: { kind_name: { kind: "base", name: "" } } }),
    computer.profile
      ? db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name: computer.profile } } })
      : Promise.resolve(null),
  ]);

  return {
    base: asValues(base?.values),
    profile: computer.profile ? { name: computer.profile, values: asValues(profile?.values) } : null,
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
 * Values are double-quoted; embedded double quotes are rejected by validation so
 * load_config (which strips one quote layer) stays correct.
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

/** target: "base" | "profile:<name>" | "host:<host>" */
function layerTarget(kind: string, name: string) {
  return kind === "base" ? "base" : `${kind}:${name}`;
}

export async function saveLayer(kind: "base" | "profile", name: string, values: ConfigValues, changedBy: string) {
  await db.$transaction([
    db.configLayer.upsert({
      where: { kind_name: { kind, name } },
      create: { kind, name, values },
      update: { values },
    }),
    db.configChange.create({ data: { target: layerTarget(kind, name), snapshot: values, changedBy } }),
  ]);
}

export async function saveComputerConfig(host: string, profile: string | null, overrides: ConfigValues, changedBy: string) {
  await db.$transaction([
    db.computer.update({
      where: { host },
      data: { profile, overrides, configUpdatedAt: new Date(), configUpdatedBy: changedBy },
    }),
    db.configChange.create({
      data: { target: `host:${host}`, snapshot: { profile, overrides }, changedBy },
    }),
  ]);
}

export function getHistory(target: string) {
  return db.configChange.findMany({ where: { target }, orderBy: { changedAt: "desc" }, take: 50 });
}

/** Restore a previous snapshot back onto its target. */
export async function restoreSnapshot(changeId: string, changedBy: string) {
  const change = await db.configChange.findUnique({ where: { id: changeId } });
  if (!change) throw new Error("Ändringen finns inte.");
  const [kind, name] = change.target.includes(":") ? change.target.split(":", 2) : ["base", ""];
  const snap = change.snapshot as Record<string, unknown>;

  if (kind === "host") {
    const overrides = asValues(snap.overrides);
    const profile = snap.profile == null ? null : String(snap.profile);
    await saveComputerConfig(name, profile, overrides, changedBy);
  } else {
    await saveLayer(kind as "base" | "profile", name, asValues(snap), changedBy);
  }
}
