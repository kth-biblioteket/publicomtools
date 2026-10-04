import "server-only";
import { db } from "@/lib/db";
import { displayName } from "@/lib/names";
import { enumOptions, type ConfigValues } from "@/lib/config";
import {
  PROFILE_KEY,
  validateValue,
  type CatalogEntry,
  type Change,
  type Group,
  type KeyType,
  type Target,
} from "@/lib/settings-shared";

/** Data and saving for the settings form (base, a profile, or one computer). */

function asValues(json: unknown): ConfigValues {
  if (!json || typeof json !== "object") return {};
  return Object.fromEntries(
    Object.entries(json as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  );
}

export async function getCatalog(): Promise<{ catalog: CatalogEntry[]; groups: Group[] }> {
  const [rows, meta] = await Promise.all([
    db.configKey.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }),
    db.configCatalog.findUnique({ where: { id: 1 } }),
  ]);
  const catalog: CatalogEntry[] = rows.map((r) => ({
    key: r.key,
    label: r.label,
    group: r.group,
    type: r.type as KeyType,
    options: enumOptions(r.options),
    unit: r.unit,
    separator: r.separator,
    defaultValue: r.defaultValue,
    help: r.help,
    example: r.example,
    advanced: r.advanced,
    perComputer: r.perComputer,
  }));
  const stored = Array.isArray(meta?.groups) ? (meta!.groups as Group[]) : [];
  const groups = [...stored];
  for (const k of catalog) if (!groups.some((g) => g.id === k.group)) groups.push({ id: k.group, label: k.group });
  return { catalog, groups };
}

export type ScopeComputer = { host: string; name: string; profile: string | null; ownKeys: string[] };

export type SettingsData = {
  target: Target;
  catalog: CatalogEntry[];
  groups: Group[];
  /** Values set in this layer */
  own: ConfigValues;
  /** The base layer (what profiles and computers inherit first) */
  base: ConfigValues;
  /** Every profile's values, so a computer's editor can switch profile without a round trip */
  profiles: Record<string, ConfigValues>;
  /** Display names of the profiles */
  profileLabels: Record<string, string>;
  /** host target only */
  profile: string | null;
  /** Computers the layer reaches, for "påverkar N datorer" */
  computers: ScopeComputer[];
};

export async function getSettingsData(target: Target): Promise<SettingsData | null> {
  const [{ catalog, groups }, layers, computers] = await Promise.all([
    getCatalog(),
    db.configLayer.findMany(),
    db.computer.findMany({ select: { host: true, computerName: true, label: true, profile: true, overrides: true }, orderBy: { host: "asc" } }),
  ]);
  const base = asValues(layers.find((l) => l.kind === "base")?.values);
  const profileLayers = layers.filter((l) => l.kind === "profile");
  const profiles = Object.fromEntries(profileLayers.map((l) => [l.name, asValues(l.values)]));
  const profileLabels = Object.fromEntries(profileLayers.map((l) => [l.name, l.label || l.name]));
  const scope: ScopeComputer[] = computers.map((c) => ({
    host: c.host,
    name: displayName(c),
    profile: c.profile,
    ownKeys: Object.keys(asValues(c.overrides)),
  }));

  let own: ConfigValues;
  let profile: string | null = null;
  if (target === "base") own = base;
  else if (target.startsWith("profile:")) {
    const name = target.slice(8);
    if (!(name in profiles)) return null;
    own = profiles[name];
  } else {
    const c = computers.find((x) => x.host === target.slice(5));
    if (!c) return null;
    own = asValues(c.overrides);
    profile = c.profile;
  }
  return { target, catalog, groups, own, base, profiles, profileLabels, profile, computers: scope };
}

export type SaveInput = {
  set: Record<string, string>;
  unset: string[];
  /** What the editor showed for each changed key (and __profile), to detect someone else's save in between */
  before: Record<string, string | null>;
  profile?: string | null;
  note?: string;
};

export type SaveResult = { ok: true; changes: Change[] } | { ok: false; error: string; issues?: { key: string; problem: string }[] };

export async function saveSettings(target: Target, input: SaveInput, changedBy: string): Promise<SaveResult> {
  const data = await getSettingsData(target);
  if (!data) return { ok: false, error: "Hittar inte det du försöker ändra. Ladda om sidan." };
  const meta = new Map(data.catalog.map((k) => [k.key, k]));
  const isHost = target.startsWith("host:");

  const issues: { key: string; problem: string }[] = [];
  for (const [key, value] of Object.entries(input.set)) {
    const m = meta.get(key);
    if (!m) issues.push({ key, problem: "Inställningen finns inte i katalogen." });
    else {
      const problem = validateValue(m, value);
      if (problem) issues.push({ key, problem });
    }
  }
  if (isHost && input.profile && !Object.hasOwn(data.profiles, input.profile))
    issues.push({ key: PROFILE_KEY, problem: `Profilen ${input.profile} finns inte.` });
  if (issues.length) return { ok: false, error: "Rätta det som är markerat och försök igen.", issues };

  const note = input.note?.trim().slice(0, 500) || null;
  const host = target.slice(5);
  const [kind, name] = target === "base" ? ["base", ""] : ["profile", target.slice(8)];

  // Read, check and write in one transaction with the row locked, so two saves of the same
  // layer run one after the other and neither overwrites the other's keys.
  return db.$transaction(async (tx): Promise<SaveResult> => {
    let own: ConfigValues;
    let currentProfile: string | null = null;
    if (isHost) {
      const rows = await tx.$queryRaw<{ overrides: unknown; profile: string | null }[]>`
        SELECT "overrides", "profile" FROM "Computer" WHERE "host" = ${host} FOR UPDATE`;
      if (!rows.length) return { ok: false, error: "Datorn finns inte längre." };
      own = asValues(rows[0].overrides);
      currentProfile = rows[0].profile;
    } else {
      const rows = await tx.$queryRaw<{ values: unknown }[]>`
        SELECT "values" FROM "ConfigLayer" WHERE "kind" = ${kind} AND "name" = ${name} FOR UPDATE`;
      own = asValues(rows[0]?.values);
    }

    // Someone else saved the same key after this editor loaded?
    const conflicts = [...Object.keys(input.set), ...input.unset].filter(
      (k) => (own[k] ?? null) !== (input.before[k] ?? null)
    );
    if (isHost && input.profile !== undefined && (input.before[PROFILE_KEY] ?? null) !== currentProfile) conflicts.push(PROFILE_KEY);
    if (conflicts.length) {
      const names = conflicts.map((k) => (k === PROFILE_KEY ? "Profil" : meta.get(k)?.label ?? k));
      return { ok: false, error: `${names.join(", ")} har ändrats av någon annan sedan du öppnade sidan. Ladda om och gör ändringen igen.` };
    }

    const values: ConfigValues = { ...own };
    const changes: Change[] = [];
    for (const [key, after] of Object.entries(input.set)) {
      if (values[key] !== after) changes.push({ key, before: values[key] ?? null, after });
      values[key] = after;
    }
    for (const key of input.unset) {
      if (key in values) changes.push({ key, before: values[key], after: null });
      delete values[key];
    }
    const newProfile = isHost && input.profile !== undefined ? input.profile : currentProfile;
    if (isHost && newProfile !== currentProfile) changes.push({ key: PROFILE_KEY, before: currentProfile, after: newProfile });
    if (!changes.length) return { ok: true, changes };

    const entry = { target, changedBy, note, changes };
    if (isHost) {
      await tx.computer.update({
        where: { host },
        data: { profile: newProfile, overrides: values, configUpdatedAt: new Date(), configUpdatedBy: changedBy },
      });
      await tx.configChange.create({ data: { ...entry, snapshot: { profile: newProfile, overrides: values } } });
    } else {
      await tx.configLayer.upsert({ where: { kind_name: { kind, name } }, create: { kind, name, values }, update: { values } });
      await tx.configChange.create({ data: { ...entry, snapshot: values } });
    }
    return { ok: true, changes };
  });
}
