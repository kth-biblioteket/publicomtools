import "server-only";
import { db } from "@/lib/db";
import { getSettingsData, saveSettings } from "@/lib/settings";
import { PROFILE_KEY, type Change, type Target } from "@/lib/settings-shared";

/**
 * The change log: every saved settings change, newest first. Rows saved by the
 * settings form carry their `changes`; older rows (the text editor, restores) only
 * have a full snapshot, so their changes are derived from the previous snapshot.
 */

type Values = Record<string, string>;

function snapshotParts(snapshot: unknown): { profile?: string | null; values: Values } {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const toValues = (o: unknown) =>
    Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  if ("overrides" in s || "profile" in s) return { profile: s.profile == null ? null : String(s.profile), values: toValues(s.overrides) };
  return { values: toValues(s) };
}

function diffSnapshots(prev: unknown, cur: unknown): Change[] {
  const a = snapshotParts(prev), b = snapshotParts(cur);
  const out: Change[] = [];
  if ("profile" in b && a.profile !== b.profile) out.push({ key: PROFILE_KEY, before: a.profile ?? null, after: b.profile ?? null });
  for (const k of new Set([...Object.keys(a.values), ...Object.keys(b.values)]))
    if (a.values[k] !== b.values[k]) out.push({ key: k, before: a.values[k] ?? null, after: b.values[k] ?? null });
  return out;
}

export type LogEntry = {
  id: string;
  target: Target;
  changedBy: string;
  changedAt: Date;
  note: string | null;
  changes: Change[];
  /** The first saved version of a layer: "changes" is everything in it */
  initial: boolean;
};

export type LogFilter = "all" | "base" | "profile" | "host";

type ChangeRow = {
  id: string;
  target: string;
  changedBy: string;
  changedAt: Date;
  note: string | null;
  changes: unknown;
  snapshot: unknown;
};

/**
 * Turn rows into entries. Rows without `changes` are diffed against the previous snapshot
 * of the same target, fetched in one query for all of them (not one query per row).
 */
async function toEntries(rows: ChangeRow[]): Promise<LogEntry[]> {
  const legacy = rows.filter((r) => !Array.isArray(r.changes));
  const older = legacy.length
    ? await db.configChange.findMany({
        where: {
          target: { in: [...new Set(legacy.map((r) => r.target))] },
          changedAt: { lt: new Date(Math.max(...legacy.map((r) => r.changedAt.getTime()))) },
        },
        orderBy: { changedAt: "desc" },
        select: { target: true, changedAt: true, snapshot: true },
      })
    : [];
  const previous = (r: ChangeRow) => older.find((o) => o.target === r.target && o.changedAt < r.changedAt);

  return rows.map((r) => {
    const base = { id: r.id, target: r.target, changedBy: r.changedBy, changedAt: r.changedAt, note: r.note };
    if (Array.isArray(r.changes)) return { ...base, changes: r.changes as Change[], initial: false };
    const prev = previous(r);
    return { ...base, changes: diffSnapshots(prev?.snapshot ?? {}, r.snapshot), initial: !prev };
  });
}

export async function listChanges(opts: { targets?: Target[]; filter?: LogFilter; limit?: number } = {}): Promise<LogEntry[]> {
  const where = opts.targets
    ? { target: { in: opts.targets } }
    : opts.filter && opts.filter !== "all"
      ? opts.filter === "base"
        ? { OR: [{ target: "base" }, { target: { startsWith: "base:" } }] }
        : { target: { startsWith: `${opts.filter}:` } }
      : {};
  const rows = await db.configChange.findMany({ where, orderBy: { changedAt: "desc" }, take: opts.limit ?? 100 });
  return toEntries(rows);
}

export async function getChange(id: string): Promise<LogEntry | null> {
  const row = await db.configChange.findUnique({ where: { id } });
  if (!row) return null;
  const [entry] = await toEntries([row]);
  return entry;
}

/** Keys whose current value is no longer what this change set them to (changed again later). */
export async function revertConflicts(entry: LogEntry): Promise<Change[]> {
  const data = await getSettingsData(entry.target);
  if (!data) return [];
  return entry.changes.filter((c) =>
    c.key === PROFILE_KEY ? data.profile !== c.after : (data.own[c.key] ?? null) !== c.after
  );
}

/** Put back what one change replaced, as a new change. Later edits of the same keys are overwritten (the dialog warns). */
export async function revertChange(id: string, changedBy: string) {
  const entry = await getChange(id);
  if (!entry) return { ok: false as const, error: "Ändringen finns inte längre." };
  if (entry.initial) return { ok: false as const, error: "Den första versionen går inte att ångra." };
  const data = await getSettingsData(entry.target);
  if (!data) return { ok: false as const, error: "Det ändringen gällde finns inte längre." };

  const set: Record<string, string> = {};
  const unset: string[] = [];
  const before: Record<string, string | null> = {};
  let profile: string | null | undefined;
  for (const c of entry.changes) {
    if (c.key === PROFILE_KEY) {
      profile = c.before;
      before[PROFILE_KEY] = data.profile;
      continue;
    }
    before[c.key] = data.own[c.key] ?? null;
    if (c.before === null) unset.push(c.key);
    else set[c.key] = c.before;
  }
  const when = entry.changedAt.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });
  return saveSettings(
    entry.target,
    { set, unset, before, ...(profile !== undefined ? { profile } : {}), note: `Ångrar ändringen ${when} av ${entry.changedBy}` },
    changedBy
  );
}
