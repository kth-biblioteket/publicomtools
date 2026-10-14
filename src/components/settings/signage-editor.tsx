"use client";

import { useEffect, useRef, useState } from "react";
import {
  activeList,
  parseSchedule,
  parseSignPages,
  serializeSchedule,
  serializeSignPages,
  SIGN_SECONDS_MAX,
  SIGN_SECONDS_MIN,
  slotOverlaps,
  slotProblem,
  type Schedule,
  type SignPage,
  type Slot,
} from "@/lib/signage";
import type { EditorField } from "./apps-editor";
import { FieldControl } from "./field-control";

/** A file in the media library as the editor needs it (src/lib/media.ts MediaItem) */
export type SignMedia = { id: string; name: string; kind: "image" | "video"; durationMs: number | null };

export type SignageProps = {
  media: SignMedia[];
  /** Absolute address of the viewer pages: <viewBase><id>?fit=cover (what the kiosks load) */
  viewBase: string;
  /** The files themselves, for thumbnails in admin */
  fileBase: string;
  uploadUrl: string;
};

const INPUT = "h-9 rounded-lg border border-field bg-white px-2.5 text-sm";
const LABEL = "text-[13px] font-bold";
const BTN = "h-9 rounded-lg border-2 border-kth-blue bg-white px-3 text-[13px] font-bold text-kth-blue hover:bg-select disabled:opacity-40";
const ICON_BTN = "size-7 shrink-0 rounded-md text-muted hover:bg-page disabled:opacity-30";
const DAYS = ["M", "T", "O", "T", "F", "L", "S"];
const DAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
// En färg per spellista (i ordning); text i kontrast mot färgen
const COLORS = [
  { bg: "#004791", fg: "#fff" },
  { bg: "#000061", fg: "#fff" },
  { bg: "#b9d6f2", fg: "#000061" },
  { bg: "#e0a82e", fg: "#3a2600" },
  { bg: "#6e2b8b", fg: "#fff" },
  { bg: "#1f7a4d", fg: "#fff" },
  { bg: "#c4cad2", fg: "#1c1f24" },
];
const HOUR_PX = 14;

const toMin = (t: string | undefined, fallback: number) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : fallback);
const move = <T,>(list: T[], i: number, d: number) => {
  const next = [...list];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
};

/**
 * Skylt: what a sign shows and when, the same on Linux and Android. Playlists and a schedule
 * (SIGN_SCHEDULE), the standard list for when nothing in the schedule applies (SIGN_PAGES), the
 * time per page and scripts. Rows are web pages or files from the media library.
 */
export function SignageEditor({
  schedule,
  pages,
  seconds,
  js,
  platform,
  signage,
}: {
  schedule?: EditorField;
  pages: EditorField;
  seconds?: EditorField;
  js?: EditorField;
  platform: string;
  signage: SignageProps;
}) {
  const [media, setMedia] = useState(signage.media);
  const sched = parseSchedule(schedule?.value ?? null);
  const std = parseSignPages(pages.value);
  const writeSchedule = (next: Schedule) => {
    if (!schedule) return;
    const text = serializeSchedule(next);
    if (text) schedule.onChange(text);
    else schedule.onClear();
  };
  const writeStd = (next: SignPage[]) => {
    const text = serializeSignPages(next);
    if (text) pages.onChange(text);
    else pages.onClear();
  };

  // Visas nu: räknas om varje halvminut, med samma regler som kioskerna
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const active = activeList(sched, now);

  const names = Object.keys(sched.lists);
  const color = (name: string) => COLORS[Math.max(0, names.indexOf(name)) % COLORS.length];
  const [open, setOpen] = useState<string | null>(names[0] ?? null);
  const openList = open && open in sched.lists ? open : (names[0] ?? null);
  const overlaps = slotOverlaps(sched);
  const fallback = platform === "android" ? "startsidan" : "första Startsidan";

  const patchSlot = (i: number, p: Partial<Slot>) => {
    const slot = { ...sched.slots[i], ...p };
    for (const k of Object.keys(p) as (keyof Slot)[]) if (p[k] === undefined) delete slot[k];
    writeSchedule({ ...sched, slots: sched.slots.map((s, j) => (j === i ? slot : s)) });
  };
  const addList = () => {
    let n = names.length + 1;
    while (`Spellista ${n}` in sched.lists) n++;
    const name = `Spellista ${n}`;
    writeSchedule({ ...sched, lists: { ...sched.lists, [name]: [] } });
    setOpen(name);
  };
  const renameList = (from: string, to: string) => {
    const name = to.trim();
    if (!name || name === from || name in sched.lists) return;
    const lists = Object.fromEntries(Object.entries(sched.lists).map(([n, p]) => [n === from ? name : n, p]));
    writeSchedule({ ...sched, lists, slots: sched.slots.map((s) => (s.list === from ? { ...s, list: name } : s)) });
    setOpen(name);
  };
  const removeList = (name: string) => {
    const used = sched.slots.filter((s) => s.list === name).length;
    if (used && !confirm(`${name} används i ${used} ${used === 1 ? "tid" : "tider"} i schemat. Ta bort listan och de tiderna?`)) return;
    const lists = { ...sched.lists };
    delete lists[name];
    writeSchedule({ ...sched, lists, slots: sched.slots.filter((s) => s.list !== name) });
    setOpen(null);
  };

  const nowText =
    active.kind === "list"
      ? `${active.name} · ${sched.lists[active.name].length} ${sched.lists[active.name].length === 1 ? "sida" : "sidor"}`
      : active.kind === "off"
        ? "Svart skärm (inget i schemat gäller)"
        : std.length
          ? `Standardlistan · ${std.length} ${std.length === 1 ? "sida" : "sidor"}`
          : `Ingen sida: skylten visar ${fallback}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-kth-navy px-4 py-3 text-white">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-kth-light-blue">Visas nu</span>
        <span className="text-[15px] font-extrabold">{nowText}</span>
        <span className="text-[13px] text-kth-light-blue">
          {now.toLocaleDateString("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" })}{" "}
          {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}
        </span>
      </div>

      {schedule && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Schema</h4>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                Vilken spellista som visas när. Tider med datum går före veckans tider, annars gäller den översta som passar.
              </p>
            </div>
            <button
              type="button"
              className={BTN}
              disabled={!names.length}
              title={names.length ? undefined : "Skapa en spellista först"}
              onClick={() => writeSchedule({ ...sched, slots: [...sched.slots, { list: names[0], days: [1, 2, 3, 4, 5], from: "08:00", to: "17:00" }] })}
            >
              + Lägg till tid
            </button>
          </div>
          {sched.slots.length === 0 && <p className="text-[13px] text-muted">Inget schema: skylten visar standardlistan hela tiden.</p>}
          {sched.slots.map((slot, i) => {
            const problem = slotProblem(slot, sched.lists);
            const hidden = overlaps.find(([, b]) => b === i);
            return (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-3 shrink-0 rounded-[3px]" style={{ background: color(slot.list).bg }} aria-hidden="true" />
                  <select aria-label={`Tid ${i + 1}, spellista`} value={slot.list} onChange={(e) => patchSlot(i, { list: e.target.value })} className={`${INPUT} min-w-[140px]`}>
                    {!(slot.list in sched.lists) && <option value={slot.list}>{slot.list || "Välj…"}</option>}
                    {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="flex gap-1" role="group" aria-label={`Tid ${i + 1}, veckodagar`}>
                    {DAYS.map((d, j) => {
                      const day = j + 1;
                      const on = !slot.days || slot.days.includes(day);
                      return (
                        <button
                          key={j}
                          type="button"
                          aria-pressed={on}
                          aria-label={DAY_NAMES[j]}
                          onClick={() => {
                            const cur = slot.days ?? [1, 2, 3, 4, 5, 6, 7];
                            const next = on ? cur.filter((x) => x !== day) : [...cur, day].sort();
                            patchSlot(i, { days: next.length === 7 ? undefined : next });
                          }}
                          className={`size-8 rounded-md text-[12.5px] font-bold ${on ? "bg-kth-blue text-white" : "border border-field bg-white text-muted"}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted">
                    <input type="time" aria-label={`Tid ${i + 1}, från`} value={slot.from ?? ""} onChange={(e) => patchSlot(i, { from: e.target.value || undefined })} className={`${INPUT} w-[104px]`} />
                    –
                    <input
                      type="time"
                      aria-label={`Tid ${i + 1}, till`}
                      value={slot.to === "24:00" ? "" : (slot.to ?? "")}
                      onChange={(e) => patchSlot(i, { to: e.target.value || undefined })}
                      className={`${INPUT} w-[104px]`}
                    />
                  </span>
                  <span className="flex-1" />
                  <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => writeSchedule({ ...sched, slots: move(sched.slots, i, -1) })} className={ICON_BTN}>↑</button>
                  <button type="button" aria-label="Flytta ner" disabled={i === sched.slots.length - 1} onClick={() => writeSchedule({ ...sched, slots: move(sched.slots, i, 1) })} className={ICON_BTN}>↓</button>
                  <button type="button" aria-label={`Ta bort tid ${i + 1}`} onClick={() => writeSchedule({ ...sched, slots: sched.slots.filter((_, j) => j !== i) })} className={`${ICON_BTN} text-base`}>×</button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-5 text-[13px] text-muted">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={!!slot.dates}
                      onChange={(e) => {
                        const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
                        patchSlot(i, { dates: e.target.checked ? [today, today] : undefined });
                      }}
                    />
                    Bara vissa datum
                  </label>
                  {slot.dates && (
                    <>
                      <input type="date" aria-label={`Tid ${i + 1}, första datum`} value={slot.dates[0]} onChange={(e) => patchSlot(i, { dates: [e.target.value, slot.dates![1]] })} className={INPUT} />
                      –
                      <input type="date" aria-label={`Tid ${i + 1}, sista datum`} value={slot.dates[1]} onChange={(e) => patchSlot(i, { dates: [slot.dates![0], e.target.value] })} className={INPUT} />
                    </>
                  )}
                  {!slot.from && !slot.to && <span>Hela dagen</span>}
                </div>
                {problem && <p className="pl-5 text-[12.5px] font-semibold text-bad-ink">Används inte: {problem}.</p>}
                {!problem && hidden && (
                  <p className="pl-5 text-[12.5px] font-semibold text-warn-ink">Krockar med tid {hidden[0] + 1}, som ligger över och gäller då.</p>
                )}
              </div>
            );
          })}
          {sched.slots.length > 0 && <WeekView schedule={sched} color={color} />}
        </section>
      )}

      {schedule && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Spellistor</h4>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">Sidor som visas i tur och ordning. Tomma sekunder: Tid per sida.</p>
            </div>
            <button type="button" className={BTN} onClick={addList}>+ Ny spellista</button>
          </div>
          {names.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Spellistor">
              {names.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="tab"
                  aria-selected={openList === n}
                  onClick={() => setOpen(n)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${openList === n ? "border-2 border-kth-blue bg-select text-kth-navy" : "border border-field bg-white text-[#3d444d]"}`}
                >
                  <span className="size-2.5 rounded-[3px]" style={{ background: color(n).bg }} aria-hidden="true" />
                  {n}
                  <span className="font-medium opacity-75">{sched.lists[n].length}</span>
                </button>
              ))}
            </div>
          )}
          {openList && (
            <div className="flex flex-col gap-2 rounded-lg bg-page p-3">
              <div className="flex flex-wrap items-center gap-2">
                <ListName key={openList} name={openList} onRename={(to) => renameList(openList, to)} taken={names} />
                <span className="flex-1" />
                <button type="button" className="text-[12.5px] font-bold text-bad-ink" onClick={() => removeList(openList)}>Ta bort listan</button>
              </div>
              <PageList
                pages={sched.lists[openList]}
                onChange={(next) => writeSchedule({ ...sched, lists: { ...sched.lists, [openList]: next } })}
                media={media}
                onUploaded={(items) => setMedia((m) => [...items.filter((x) => !m.some((y) => y.id === x.id)), ...m])}
                signage={signage}
                label={openList}
              />
            </div>
          )}
          {schedule.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{schedule.problem}</p>}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-[10px] border border-line-soft px-4 py-4">
        <div>
          <h4 className="text-[15px] font-extrabold">{schedule ? "När inget i schemat gäller" : "Sidor"}</h4>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {schedule ? "Standardlistan visas, t.ex. på söndagar och sena kvällar. " : ""}
            {std.length ? "" : `Tom lista: skylten visar ${fallback}.`}
          </p>
        </div>
        <PageList
          pages={std}
          onChange={writeStd}
          media={media}
          onUploaded={(items) => setMedia((m) => [...items.filter((x) => !m.some((y) => y.id === x.id)), ...m])}
          signage={signage}
          label="Standardlistan"
        />
        {pages.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{pages.problem}</p>}
        {schedule && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sched.off} onChange={(e) => writeSchedule({ ...sched, off: e.target.checked })} />
            Svart skärm i stället när inget i schemat gäller
          </label>
        )}
      </section>

      {(seconds || js) && (
        <section className="grid gap-4 rounded-[10px] border border-line-soft px-4 py-4 @2xl:grid-cols-2">
          {seconds && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`f-${seconds.meta.key}`} className={LABEL}>{seconds.meta.label}</label>
              <FieldControl {...seconds} invalid={!!seconds.problem} />
              {seconds.meta.help && <p className="text-[12px] leading-snug text-muted">{seconds.meta.help}</p>}
            </div>
          )}
          {js && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`f-${js.meta.key}`} className={LABEL}>{js.meta.label}</label>
              <div className="flex h-[38px] items-center"><FieldControl {...js} invalid={!!js.problem} /></div>
              {js.meta.help && <p className="text-[12px] leading-snug text-muted">{js.meta.help}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ListName({ name, onRename, taken }: { name: string; onRename: (to: string) => void; taken: string[] }) {
  const [v, setV] = useState(name);
  const clash = v.trim() !== name && taken.includes(v.trim());
  const commit = () => (v.trim() && !clash ? onRename(v) : setV(name));
  return (
    <span className="flex flex-col">
      <input
        aria-label="Spellistans namn"
        value={v}
        maxLength={40}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className={`${INPUT} w-[220px] font-bold`}
      />
      {clash && <span className="text-[12px] font-semibold text-bad-ink">Det namnet finns redan.</span>}
    </span>
  );
}

/** Mon–Sun × 00–24 with the weekly times as blocks; date rows listed above */
function WeekView({ schedule, color }: { schedule: Schedule; color: (n: string) => { bg: string; fg: string } }) {
  const usable = schedule.slots.map((s, i) => ({ s, i })).filter(({ s }) => !slotProblem(s, schedule.lists));
  const dated = usable.filter(({ s }) => s.dates);
  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-[14px] font-extrabold">Veckan</h5>
      {dated.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {dated.map(({ s, i }) => (
            <li key={i} className="flex items-center gap-2">
              <span className="size-3 rounded-[3px]" style={{ background: color(s.list).bg }} aria-hidden="true" />
              <b>{s.list}</b> {s.dates![0] === s.dates![1] ? s.dates![0] : `${s.dates![0]} – ${s.dates![1]}`}
              {s.from || s.to ? ` ${s.from ?? "00:00"}–${s.to ?? "24:00"}` : ""} <span className="text-muted">går före veckan</span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-1 overflow-x-auto">
        <span />
        {DAY_NAMES.map((d) => <span key={d} className="text-center text-[12px] font-bold text-[#3d444d]">{d}</span>)}
        <div className="relative" style={{ height: 24 * HOUR_PX }}>
          {[0, 4, 8, 12, 16, 20].map((h) => (
            <span key={h} className="absolute right-1 font-mono text-[10px] text-faint" style={{ top: h * HOUR_PX - 5 }}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>
        {DAY_NAMES.map((_, j) => {
          const day = j + 1;
          // Den övre raden vinner där tider krockar: rita nedifrån och upp så att den hamnar överst
          const blocks = usable.filter(({ s }) => !s.dates && (!s.days || s.days.includes(day))).reverse();
          return (
            <div
              key={j}
              className="relative overflow-hidden rounded-md border border-line"
              style={{ height: 24 * HOUR_PX, background: "repeating-linear-gradient(45deg,#f4f5f7 0 6px,#eceef1 6px 12px)" }}
              aria-label={DAY_NAMES[j]}
            >
              {blocks.map(({ s, i }) => {
                const from = toMin(s.from, 0), to = toMin(s.to, 1440);
                const c = color(s.list);
                return (
                  <div
                    key={i}
                    className="absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-[11px] font-bold leading-tight"
                    style={{ top: (from / 60) * HOUR_PX, height: Math.max(((to - from) / 60) * HOUR_PX, 10), background: c.bg, color: c.fg }}
                    title={`${s.list} ${s.from ?? "00:00"}–${s.to ?? "24:00"}`}
                  >
                    {s.list}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-muted">Randigt: standardlistan{schedule.off ? " (svart skärm)" : ""}.</p>
    </div>
  );
}

/** The rows of one list: web pages and files from the media library */
function PageList({
  pages,
  onChange,
  media,
  onUploaded,
  signage,
  label,
}: {
  pages: SignPage[];
  onChange: (next: SignPage[]) => void;
  media: SignMedia[];
  onUploaded: (items: SignMedia[]) => void;
  signage: SignageProps;
  label: string;
}) {
  // Adresser skrivs lokalt och sparas när fältet lämnas, så att varje tangent inte blir ett utkast
  const [rows, setRows] = useState(pages);
  const [seen, setSeen] = useState(pages);
  if (pages !== seen && JSON.stringify(pages) !== JSON.stringify(seen)) {
    setSeen(pages);
    setRows(pages);
  }
  const [picking, setPicking] = useState(false);
  const commit = (next: SignPage[]) => {
    setRows(next);
    setSeen(next);
    onChange(next);
  };
  const patch = (i: number, p: Partial<SignPage>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const byId = new Map(media.map((m) => [m.id, m]));
  const addMedia = (m: SignMedia) =>
    commit([
      ...rows,
      {
        url: `${signage.viewBase}${m.id}?fit=cover`,
        s: m.kind === "video" && m.durationMs ? Math.min(SIGN_SECONDS_MAX, Math.max(SIGN_SECONDS_MIN, Math.ceil(m.durationMs / 1000))) : null,
        media: m.id,
      },
    ]);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 && <p className="text-[13px] text-muted">Inga sidor än.</p>}
      {rows.map((p, i) => {
        const m = p.media ? byId.get(p.media) : undefined;
        const contain = p.url.includes("fit=contain");
        return (
          <div key={i} className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
            {p.media ? (
              <span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-field bg-white p-1 pr-2">
                <MediaThumb item={m} id={p.media} fileBase={signage.fileBase} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{m ? m.name : "Filen finns inte längre"}</span>
                <select
                  aria-label={`${label}, sida ${i + 1}, storlek`}
                  value={contain ? "contain" : "cover"}
                  onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, url: x.url.replace(/fit=(cover|contain)/, `fit=${e.target.value}`) } : x)))}
                  className="h-7 rounded-md border border-field bg-white px-1.5 text-[12.5px]"
                >
                  <option value="cover">Fyll skärmen</option>
                  <option value="contain">Hela bilden</option>
                </select>
              </span>
            ) : (
              <input
                type="url"
                value={p.url}
                placeholder="https://apps.lib.kth.se/skylt/…"
                aria-label={`${label}, sida ${i + 1}, adress`}
                onChange={(e) => patch(i, { url: e.target.value })}
                onBlur={() => commit(rows)}
                onKeyDown={(e) => e.key === "Enter" && commit(rows)}
                className={`${INPUT} min-w-[200px] flex-1`}
              />
            )}
            <input
              type="number"
              min={SIGN_SECONDS_MIN}
              max={SIGN_SECONDS_MAX}
              value={p.s ?? ""}
              placeholder="sek"
              title="Sekunder (tomt: Tid per sida)"
              aria-label={`${label}, sida ${i + 1}, sekunder`}
              onChange={(e) => patch(i, { s: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
              onBlur={() => commit(rows)}
              className={`${INPUT} w-[72px] shrink-0 px-2`}
            />
            <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => commit(move(rows, i, -1))} className={ICON_BTN}>↑</button>
            <button type="button" aria-label="Flytta ner" disabled={i === rows.length - 1} onClick={() => commit(move(rows, i, 1))} className={ICON_BTN}>↓</button>
            <button type="button" aria-label={`Ta bort sida ${i + 1}`} onClick={() => commit(rows.filter((_, j) => j !== i))} className={`${ICON_BTN} text-base`}>×</button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 pt-1">
        <button type="button" onClick={() => setRows((r) => [...r, { url: "", s: null }])} className="text-[13px] font-bold text-kth-blue">+ Webbsida</button>
        <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className="text-[13px] font-bold text-kth-blue">+ Bild, film eller pdf</button>
      </div>
      {picking && (
        <MediaPicker
          media={media}
          signage={signage}
          onPick={(items) => {
            commit([
              ...rows,
              ...items.map((m) => ({
                url: `${signage.viewBase}${m.id}?fit=cover`,
                s: m.kind === "video" && m.durationMs ? Math.min(SIGN_SECONDS_MAX, Math.max(SIGN_SECONDS_MIN, Math.ceil(m.durationMs / 1000))) : null,
                media: m.id,
              })),
            ]);
            setPicking(false);
          }}
          onPickOne={(m) => {
            addMedia(m);
            setPicking(false);
          }}
          onUploaded={onUploaded}
        />
      )}
    </div>
  );
}

function MediaThumb({ item, id, fileBase }: { item?: SignMedia; id: string; fileBase: string }) {
  const cls = "h-10 w-16 shrink-0 rounded bg-kth-navy object-cover";
  if (!item) return <span className={`${cls} flex items-center justify-center bg-bad-bg text-[10px] font-semibold text-bad-ink`}>Saknas</span>;
  return item.kind === "video" ? (
    <video src={`${fileBase}${id}#t=0.5`} muted preload="metadata" className={cls} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- ur mediebiblioteket, redan nedskalad
    <img src={`${fileBase}${id}`} alt="" loading="lazy" className={cls} />
  );
}

/** The media library to pick from, and upload (a pdf adds all its pages, in order) */
function MediaPicker({
  media,
  signage,
  onPick,
  onPickOne,
  onUploaded,
}: {
  media: SignMedia[];
  signage: SignageProps;
  onPick: (items: SignMedia[]) => void;
  onPickOne: (m: SignMedia) => void;
  onUploaded: (items: SignMedia[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setError(null);
    setBusy(file.name);
    try {
      const res = await fetch(signage.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { items?: SignMedia[]; error?: string };
      if (!res.ok || !json.items) setError(json.error ?? `Uppladdningen misslyckades (${res.status}).`);
      else {
        onUploaded(json.items);
        onPick(json.items);
      }
    } catch {
      setError("Uppladdningen avbröts. Kontrollera nätet och försök igen.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? `Laddar upp ${busy}…` : "Ladda upp…"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <span className="text-[12.5px] text-muted">Bild (JPEG, PNG, WebP), pdf (en sida per bild) eller film (MP4). Eller välj nedan.</span>
      </div>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-bad-ink">{error}</p>}
      {media.length ? (
        <div className="grid max-h-[280px] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto">
          {media.map((m) => (
            <button key={m.id} type="button" onClick={() => onPickOne(m)} className="flex flex-col gap-1 rounded-lg border border-line p-1.5 text-left hover:border-kth-blue">
              <MediaThumb item={m} id={m.id} fileBase={signage.fileBase} />
              <span className="truncate text-[12px]">{m.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted">Mediebiblioteket är tomt. Ladda upp en fil.</p>
      )}
    </div>
  );
}
