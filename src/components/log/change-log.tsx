import Link from "next/link";
import { db } from "@/lib/db";
import { listChanges, type LogFilter } from "@/lib/changelog";
import { getCatalog } from "@/lib/settings";
import { getProfileLabels } from "@/lib/profiles";
import { formatValue, PROFILE_KEY, splitList, type CatalogEntry, type Change, type Target } from "@/lib/settings-shared";
import { formatWhen } from "@/lib/status";
import { Chip } from "@/components/ui/chip";
import { RevertButton } from "./revert-button";

function ChangeLine({ c, meta }: { c: Change; meta?: CatalogEntry }) {
  const label = c.key === PROFILE_KEY ? "Profil" : meta?.label ?? c.key;
  if (meta?.type === "csv" && c.before !== null && c.after !== null) {
    const a = splitList(c.before, meta.separator), b = splitList(c.after, meta.separator);
    const added = b.filter((x) => !a.includes(x)), removed = a.filter((x) => !b.includes(x));
    return (
      <li className="break-words">
        <b>{label}</b>:{" "}
        {added.map((x) => <span key={`+${x}`} className="mr-2 font-semibold text-[#0d6b2c]">+ {x}</span>)}
        {removed.map((x) => <span key={`-${x}`} className="mr-2 text-[#8f1d2c]">− {x}</span>)}
        {!added.length && !removed.length && <span className="text-muted">ordningen ändrad</span>}
      </li>
    );
  }
  const show = (v: string | null) => (c.key === PROFILE_KEY ? v ?? "ingen" : v === null ? "inte satt" : formatValue(meta, v));
  return (
    <li className="break-words">
      <b>{label}</b>
      {meta?.advanced && <span className="ml-1 align-middle"><Chip tone="it">IT</Chip></span>}:{" "}
      <span className="text-[#8f1d2c] line-through decoration-[#8f1d2c]/40">{show(c.before)}</span> →{" "}
      <span className="font-semibold text-[#0d6b2c]">{show(c.after)}</span>
    </li>
  );
}

function dayLabel(d: Date, now: Date) {
  const f = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  if (f(d) === f(now)) return "Idag";
  if (f(d) === f(new Date(now.getTime() - 86400000))) return "Igår";
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long", day: "numeric", month: "long" });
}

/** Change entries, newest first, grouped by day, each with "Ångra den här ändringen". */
export async function ChangeLog({ targets, filter, showTarget = true }: { targets?: Target[]; filter?: LogFilter; showTarget?: boolean }) {
  const now = new Date();
  const [entries, { catalog }, computers, profileLabels] = await Promise.all([
    listChanges({ targets, filter }),
    getCatalog(),
    db.computer.findMany({ select: { host: true, computerName: true } }),
    getProfileLabels(),
  ]);
  const meta = new Map(catalog.map((k) => [k.key, k]));
  const names = new Map(computers.map((c) => [c.host, c.computerName || c.host]));
  const visible = entries.filter((e) => e.changes.length);

  const targetLink = (t: Target) => {
    if (t === "base") return { href: "/config/base", label: "Grundinställningar" };
    if (t.startsWith("profile:")) return { href: `/config/profiles/${t.slice(8)}`, label: `Profil ${profileLabels.get(t.slice(8)) ?? t.slice(8)}` };
    const host = t.slice(5);
    return { href: `/computers/${host}/settings`, label: names.get(host) ?? host };
  };

  if (!visible.length) return <p className="text-sm text-muted">Inga ändringar än.</p>;

  const days = visible.map((e) => dayLabel(e.changedAt, now));
  return (
    <div className="flex flex-col gap-3">
      {visible.map((e, i) => {
        const header = i === 0 || days[i] !== days[i - 1] ? days[i] : null;
        const t = targetLink(e.target);
        const lines = e.changes.map((c) => ({
          key: c.key,
          label: c.key === PROFILE_KEY ? "Profil" : meta.get(c.key)?.label ?? c.key,
          becomes: c.key === PROFILE_KEY ? (c.before ? profileLabels.get(c.before) ?? c.before : "ingen profil") : c.before === null ? "inte satt (ärvs)" : formatValue(meta.get(c.key), c.before),
        }));
        return (
          <div key={e.id} className="contents">
            {header && <div className="mt-2 text-xs font-bold uppercase tracking-wider text-faint first:mt-0">{header}</div>}
            <article className="flex flex-col gap-2 rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
                <span className="font-bold text-ink">{e.changedBy}</span>
                <span>{formatWhen(e.changedAt, now)}</span>
                {showTarget && <Link href={t.href} className="font-bold text-kth-blue">{t.label}</Link>}
              </div>
              {e.note && <p className="text-sm italic text-[#3d444d]">”{e.note}”</p>}
              {e.initial ? (
                <p className="text-sm text-muted">Första versionen, {e.changes.length} inställningar.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {e.changes.map((c) => <ChangeLine key={c.key} c={c} meta={meta.get(c.key)} />)}
                </ul>
              )}
              {!e.initial && (
                <div>
                  <RevertButton id={e.id} title={`${t.label} · ${e.changedBy}, ${formatWhen(e.changedAt, now)}`} lines={lines} />
                </div>
              )}
            </article>
          </div>
        );
      })}
    </div>
  );
}

