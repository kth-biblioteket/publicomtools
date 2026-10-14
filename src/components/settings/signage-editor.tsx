"use client";

import { useMemo, useRef, useState } from "react";
import {
  activeList,
  nextChange,
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
import { useMinute } from "./use-minute";

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

const SECTION = "flex flex-col gap-3 rounded-xl border border-[#d9dde2] bg-white px-5 py-[18px]";
const OUTLINE_BTN = "h-9 shrink-0 rounded-lg border-2 border-kth-blue bg-white px-3 text-[13px] font-bold text-kth-blue hover:bg-select disabled:opacity-40";
const BOX = "h-9 rounded-lg border border-[#c4cad2] bg-white text-[13.5px]";
const ARROW = "size-[26px] shrink-0 rounded text-[15px] text-[#5a6270] hover:bg-page disabled:opacity-30";
const LINK = "text-[13px] font-bold text-kth-blue";
const DAYS = ["M", "T", "O", "T", "F", "L", "S"];
const DAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
// En färg per spellista (i ordning); text i kontrast mot färgen
const COLORS = [
  { bg: "#004791", fg: "#ffffff" },
  { bg: "#000061", fg: "#ffffff" },
  { bg: "#b9d6f2", fg: "#000061" },
  { bg: "#e0a82e", fg: "#3a2600" },
  { bg: "#6e2b8b", fg: "#ffffff" },
  { bg: "#1f7a4d", fg: "#ffffff" },
  { bg: "#c4cad2", fg: "#1c1f24" },
];
const HATCH = "repeating-linear-gradient(45deg,#f4f5f7 0 6px,#eceef1 6px 12px)";
const HOUR_PX = 21;

const toMin = (t: string | undefined, fallback: number) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : fallback);
const move = <T,>(list: T[], i: number, d: number) => {
  const next = [...list];
  [next[i], next[i + d]] = [next[i + d], next[i]];
  return next;
};
const pagesText = (n: number) => `${n} ${n === 1 ? "sida" : "sidor"}`;
const sthlm = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", ...o });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }).replace(".", "");

/**
 * Skylt: what a sign shows and when, the same on Linux and Android (design "Skylt i admin").
 * Playlists and a schedule (SIGN_SCHEDULE), the standard list for when nothing in the schedule
 * applies (SIGN_PAGES), the time per page and scripts. Rows are web pages or library files.
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
  const addToLibrary = (items: SignMedia[]) => setMedia((m) => [...items.filter((x) => !m.some((y) => y.id === x.id)), ...m]);
  const scheduleText = schedule?.value ?? null;
  const sched = useMemo(() => parseSchedule(scheduleText), [scheduleText]);
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

  const names = Object.keys(sched.lists);
  const color = (name: string) => COLORS[Math.max(0, names.indexOf(name)) % COLORS.length];
  const [open, setOpen] = useState<string | null>(names[0] ?? null);
  const openList = open && open in sched.lists ? open : (names[0] ?? null);
  const fallback = platform === "android" ? "startsidan" : "första Startsidan";

  // Visas nu och nästa byte, med samma regler som kioskerna; bara i webbläsaren (useMinute)
  const now = useMinute();
  const active = now ? activeList(sched, now) : null;
  const next = useMemo(() => (now ? nextChange(sched, now) : null), [sched, now]);
  const describe = (a: ReturnType<typeof activeList>) =>
    a.kind === "list" ? a.name : a.kind === "off" ? "svart skärm" : std.length ? "standardlistan" : fallback;
  const count = (a: ReturnType<typeof activeList>) => (a.kind === "list" ? sched.lists[a.name].length : a.kind === "standard" ? std.length : 0);
  const sameDay = (a: Date, b: Date) => sthlm(a, { dateStyle: "short" }) === sthlm(b, { dateStyle: "short" });
  const nextText =
    next && now
      ? `byter till ${describe(next.to)} ${sameDay(next.at, now) ? "" : `på ${sthlm(next.at, { weekday: "long" })} `}kl ${sthlm(next.at, { hour: "2-digit", minute: "2-digit" })}`
      : null;

  const patchSlot = (i: number, p: Partial<Slot>) => {
    const slot = { ...sched.slots[i], ...p };
    for (const k of Object.keys(p) as (keyof Slot)[]) if (p[k] === undefined) delete slot[k];
    writeSchedule({ ...sched, slots: sched.slots.map((s, j) => (j === i ? slot : s)) });
  };
  const addList = () => {
    let n = names.length + 1;
    while (`Spellista ${n}` in sched.lists) n++;
    writeSchedule({ ...sched, lists: { ...sched.lists, [`Spellista ${n}`]: [] } });
    setOpen(`Spellista ${n}`);
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
  const overlaps = slotOverlaps(sched);

  return (
    <div className="@container flex flex-col gap-3.5">
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[19px] font-extrabold text-kth-navy">Skylt</h3>
        <span className="text-[13px] text-[#5a6270]">Vad skärmen visar och när</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl bg-kth-navy px-[18px] py-3.5 text-white">
        <span className="text-[12px] font-bold uppercase tracking-[.06em] text-kth-light-blue">Visas nu</span>
        <span className="text-[17px] font-extrabold">
          {active ? (active.kind === "list" ? active.name : active.kind === "off" ? "Svart skärm" : std.length ? "Standardlistan" : `Ingen sida (${fallback})`) : "…"}
        </span>
        {active && now && (
          <span className="text-[14px] text-kth-light-blue">
            {[`${sthlm(now, { weekday: "long" })} ${sthlm(now, { hour: "2-digit", minute: "2-digit" })}`, count(active) ? `${pagesText(count(active))} i tur och ordning` : null, nextText]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>

      {schedule && (
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Schema</h4>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">Vilken spellista som visas när. Datumrader går före veckorader, annars gäller den översta som passar.</p>
            </div>
            <button
              type="button"
              className={OUTLINE_BTN}
              disabled={!names.length}
              title={names.length ? undefined : "Skapa en spellista först"}
              onClick={() => writeSchedule({ ...sched, slots: [...sched.slots, { list: names[0], days: [1, 2, 3, 4, 5], from: "08:00", to: "17:00" }] })}
            >
              + Lägg till tid
            </button>
          </div>
          {sched.slots.length === 0 ? (
            <p className="text-[13px] text-[#5a6270]">Inget schema: skylten visar standardlistan hela tiden.</p>
          ) : (
            <>
              <div className="hidden gap-2.5 px-0.5 text-[12px] font-bold text-[#5a6270] @3xl:grid @3xl:grid-cols-[150px_234px_140px_minmax(0,1fr)_84px]">
                <span>Spellista</span>
                <span>Dagar</span>
                <span>Tid</span>
                <span>Datum</span>
                <span />
              </div>
              {sched.slots.map((slot, i) => (
                <SlotRow
                  key={i}
                  i={i}
                  slot={slot}
                  sched={sched}
                  names={names}
                  color={color}
                  overlapWith={overlaps.find(([, b]) => b === i)?.[0]}
                  onPatch={(p) => patchSlot(i, p)}
                  onMove={(d) => writeSchedule({ ...sched, slots: move(sched.slots, i, d) })}
                  onRemove={() => writeSchedule({ ...sched, slots: sched.slots.filter((_, j) => j !== i) })}
                />
              ))}
              <WeekView schedule={sched} color={color} />
            </>
          )}
        </section>
      )}

      {schedule && (
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Spellistor</h4>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">Sidor som visas i tur och ordning. Sekunder tomt: Tid per sida.</p>
            </div>
            <button type="button" className={OUTLINE_BTN} onClick={addList}>+ Ny spellista</button>
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
                  className={`inline-flex h-8 items-center gap-[7px] rounded-full px-3 text-[13px] font-bold ${openList === n ? "border-2 border-kth-blue bg-kth-light-blue text-kth-navy" : "border border-[#c4cad2] bg-white text-[#3d444d]"}`}
                >
                  <span className="size-2.5 rounded-[3px]" style={{ background: color(n).bg }} aria-hidden="true" />
                  {n}
                  <span className="font-medium opacity-75">{pagesText(sched.lists[n].length)}</span>
                </button>
              ))}
            </div>
          )}
          {openList && (
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-[#f6f8fa] p-3">
              <ListHeader key={openList} name={openList} taken={names} onRename={(to) => renameList(openList, to)} onRemove={() => removeList(openList)} />
              <PageList
                pages={sched.lists[openList]}
                onChange={(next) => writeSchedule({ ...sched, lists: { ...sched.lists, [openList]: next } })}
                media={media}
                onUploaded={addToLibrary}
                signage={signage}
                label={openList}
              />
            </div>
          )}
          {schedule.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{schedule.problem}</p>}
        </section>
      )}

      <section className="grid gap-x-6 gap-y-3.5 rounded-xl border border-[#d9dde2] bg-white px-5 py-[18px] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <h4 className="text-[15px] font-extrabold">{schedule ? "När inget i schemat gäller" : "Sidor"}</h4>
          <p className="mt-[3px] text-[13px] text-[#5a6270]">
            {schedule
              ? "Standardlistan visas, t.ex. på söndagar och sena kvällar. Släck skärmen i stället om den inte ska visa något då."
              : "Sidorna som visas i tur och ordning."}{" "}
            {std.length ? "" : `Tom lista: skylten visar ${fallback}.`}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <PageList pages={std} onChange={writeStd} media={media} onUploaded={addToLibrary} signage={signage} label="Standardlistan" />
          {pages.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{pages.problem}</p>}
          {schedule && (
            <button
              type="button"
              role="switch"
              aria-checked={sched.off}
              onClick={() => writeSchedule({ ...sched, off: !sched.off })}
              className="flex items-center gap-2.5 self-start text-[14px]"
            >
              <span className={`relative h-6 w-10 rounded-full transition-colors ${sched.off ? "bg-kth-blue" : "bg-[#c4cad2]"}`}>
                <span className={`absolute top-[3px] size-[18px] rounded-full bg-white transition-[left] ${sched.off ? "left-[19px]" : "left-[3px]"}`} />
              </span>
              Svart skärm när inget gäller
            </button>
          )}
        </div>
        {seconds && (
          <>
            <div>
              <label htmlFor={`f-${seconds.meta.key}`} className="text-[15px] font-extrabold">Tid per sida</label>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">När en sida inte har egna sekunder (5–3600).</p>
            </div>
            <div className="max-w-[260px]">
              <FieldControl {...seconds} invalid={!!seconds.problem} />
              {seconds.problem && <p className="mt-1 text-[12.5px] font-semibold text-bad-ink">{seconds.problem}</p>}
            </div>
          </>
        )}
        {js && (
          <>
            <div>
              <label htmlFor={`f-${js.meta.key}`} className="text-[15px] font-extrabold">Sidorna får köra JavaScript</label>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">På som standard. Delresurser bara från tillåtna webbplatser.</p>
            </div>
            <div className="flex h-9 items-center">
              <FieldControl {...js} invalid={!!js.problem} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** One time in the schedule, on one row as in the design: list, days, time, dates, order */
function SlotRow({
  i,
  slot,
  sched,
  names,
  color,
  overlapWith,
  onPatch,
  onMove,
  onRemove,
}: {
  i: number;
  slot: Slot;
  sched: Schedule;
  names: string[];
  color: (n: string) => { bg: string; fg: string };
  overlapWith?: number;
  onPatch: (p: Partial<Slot>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const problem = slotProblem(slot, sched.lists);
  const [editDates, setEditDates] = useState(false);
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const DATE = "h-[30px] rounded-md border border-[#c4cad2] px-1.5 text-[12.5px]";
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-[#e6e9ed] px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2.5 @3xl:grid @3xl:grid-cols-[150px_234px_140px_minmax(0,1fr)_84px]">
        <span className="flex h-[34px] items-center gap-2 rounded-lg border border-[#c4cad2] pl-2.5 pr-1">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color(slot.list).bg }} aria-hidden="true" />
          <select aria-label={`Tid ${i + 1}, spellista`} value={slot.list} onChange={(e) => onPatch({ list: e.target.value })} className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none">
            {!(slot.list in sched.lists) && <option value={slot.list}>{slot.list || "Välj…"}</option>}
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
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
                  onPatch({ days: next.length === 7 ? undefined : next });
                }}
                className={`size-[30px] rounded-[7px] text-[12.5px] font-bold ${on ? "bg-kth-blue text-white" : "border border-[#c4cad2] bg-white text-[#6b7380]"}`}
              >
                {d}
              </button>
            );
          })}
        </span>
        <span className="flex items-center gap-1 font-mono text-[13px]">
          <TimeInput label={`Tid ${i + 1}, från`} value={slot.from} placeholder="00:00" onChange={(v) => onPatch({ from: v })} />
          –
          <TimeInput label={`Tid ${i + 1}, till`} value={slot.to} placeholder="24:00" onChange={(v) => onPatch({ to: v })} />
        </span>
        <span className="min-w-0 text-[13px]">
          <button
            type="button"
            aria-expanded={editDates}
            onClick={() => {
              if (!slot.dates) onPatch({ dates: [today(), today()] });
              setEditDates((e) => !e || !slot.dates);
            }}
            className={`whitespace-nowrap text-left underline decoration-dotted underline-offset-2 hover:text-kth-blue ${slot.dates ? "text-ink" : "text-[#8a929d]"}`}
          >
            {slot.dates ? `${shortDate(slot.dates[0])}${slot.dates[1] !== slot.dates[0] ? ` – ${shortDate(slot.dates[1])}` : ""}` : "Alla datum"}
          </button>
        </span>
        <span className="flex gap-0.5">
          <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => onMove(-1)} className={ARROW}>↑</button>
          <button type="button" aria-label="Flytta ner" disabled={i === sched.slots.length - 1} onClick={() => onMove(1)} className={ARROW}>↓</button>
          <button type="button" aria-label={`Ta bort tid ${i + 1}`} onClick={onRemove} className={ARROW}>×</button>
        </span>
      </div>
      {editDates && slot.dates && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#5a6270]">
          Från
          <input type="date" aria-label={`Tid ${i + 1}, första datum`} value={slot.dates[0]} onChange={(e) => onPatch({ dates: [e.target.value, slot.dates![1]] })} className={DATE} />
          till och med
          <input type="date" aria-label={`Tid ${i + 1}, sista datum`} value={slot.dates[1]} onChange={(e) => onPatch({ dates: [slot.dates![0], e.target.value] })} className={DATE} />
          <button type="button" className="ml-1 font-bold text-kth-blue" onClick={() => setEditDates(false)}>Klar</button>
          <button
            type="button"
            className="font-bold text-kth-blue"
            onClick={() => {
              onPatch({ dates: undefined });
              setEditDates(false);
            }}
          >
            Alla datum
          </button>
        </div>
      )}
      {problem && <p className="text-[12.5px] font-semibold text-bad-ink">Används inte: {problem}.</p>}
      {!problem && overlapWith !== undefined && <p className="text-[12.5px] font-semibold text-warn-ink">Krockar med tid {overlapWith + 1}, som ligger över och gäller då.</p>}
    </div>
  );
}

/** HH:MM, committed when it's a whole time or emptied (empty = from midnight / to midnight) */
function TimeInput({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder: string; onChange: (v: string | undefined) => void }) {
  const [v, setV] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setV(value ?? "");
  }
  const commit = () => {
    const t = v.trim().replace(/^(\d):/, "0$1:").replace(/^(\d\d)(\d\d)$/, "$1:$2").replace(/^(\d\d?)$/, (h) => `${h.padStart(2, "0")}:00`);
    if (!t) onChange(undefined);
    else if (/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(t)) onChange(t);
    else setV(value ?? "");
  };
  return (
    <input
      aria-label={label}
      value={v}
      placeholder={placeholder}
      inputMode="numeric"
      maxLength={5}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="h-[30px] w-[60px] rounded-md border border-[#c4cad2] px-1.5 text-center"
    />
  );
}

function ListHeader({ name, taken, onRename, onRemove }: { name: string; taken: string[]; onRename: (to: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(name);
  const clash = v.trim() !== name && taken.includes(v.trim());
  const commit = () => {
    if (v.trim() && !clash) onRename(v);
    else setV(name);
    setEditing(false);
  };
  return (
    <div className="mb-0.5 flex flex-wrap items-center gap-2">
      {editing ? (
        <>
          <input
            autoFocus
            aria-label="Spellistans namn"
            value={v}
            maxLength={40}
            onChange={(e) => setV(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setV(name);
                setEditing(false);
              }
            }}
            className="h-8 w-[220px] rounded-md border border-[#c4cad2] px-2 text-[14px] font-extrabold"
          />
          {clash && <span className="text-[12px] font-semibold text-bad-ink">Det namnet finns redan.</span>}
        </>
      ) : (
        <>
          <span className="text-[14px] font-extrabold">{name}</span>
          <button type="button" className="text-[12.5px] font-bold text-kth-blue" onClick={() => setEditing(true)}>Byt namn</button>
        </>
      )}
      <span className="flex-1" />
      <button type="button" className="text-[12.5px] font-bold text-[#a1271d]" onClick={onRemove}>Ta bort listan</button>
    </div>
  );
}

/** Mon–Sun with the weekly times as blocks (07–22, wider if a time is outside); date rows in the legend */
function WeekView({ schedule, color }: { schedule: Schedule; color: (n: string) => { bg: string; fg: string } }) {
  const usable = schedule.slots.map((s, i) => ({ s, i })).filter(({ s }) => !slotProblem(s, schedule.lists));
  const weekly = usable.filter(({ s }) => !s.dates);
  const dated = usable.filter(({ s }) => s.dates);
  const start = Math.min(7, ...weekly.map(({ s }) => Math.floor(toMin(s.from, 0) / 60)));
  const end = Math.max(22, ...weekly.map(({ s }) => Math.ceil(toMin(s.to, 1440) / 60)));
  const y = (min: number) => (min / 60 - start) * HOUR_PX + 6;
  const height = (end - start) * HOUR_PX + 12;
  const hours: number[] = [];
  for (let h = start % 2 ? start + 1 : start + 2; h <= end; h += 2) hours.push(h);
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-[14px] font-extrabold">Veckan</h5>
        <span className="flex flex-wrap gap-3.5 text-[12px] text-[#5a6270]">
          <span className="flex items-center gap-[5px]">
            <span className="size-3 rounded-[3px] border border-[#d0d5db]" style={{ background: HATCH }} aria-hidden="true" />
            {schedule.off ? "Svart skärm" : "Standardlistan"}
          </span>
          {dated.map(({ s, i }) => (
            <span key={i}>
              Datum: {s.list} {shortDate(s.dates![0])}
              {s.dates![1] !== s.dates![0] ? `–${shortDate(s.dates![1])}` : ""} går före veckan
            </span>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1">
        <span />
        {DAY_NAMES.map((d) => <span key={d} className="text-center text-[12px] font-bold text-[#3d444d]">{d}</span>)}
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <span key={h} className="absolute right-1.5 font-mono text-[10.5px] text-[#6b7380]" style={{ top: y(h * 60) - 6 }}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>
        {DAY_NAMES.map((name, j) => {
          const day = j + 1;
          // Den övre raden i schemat vinner där tider krockar: rita den sist så att den hamnar överst
          const blocks = weekly.filter(({ s }) => !s.days || s.days.includes(day)).reverse();
          return (
            <div key={name} className="relative overflow-hidden rounded-lg border border-[#e0e4e9]" style={{ height, background: HATCH }} aria-label={name}>
              {blocks.map(({ s, i }) => {
                const from = toMin(s.from, 0), to = toMin(s.to, 1440);
                const c = color(s.list);
                return (
                  <div
                    key={i}
                    className="absolute inset-x-[3px] overflow-hidden rounded-md px-[7px] py-[5px] text-[12px] font-bold leading-tight"
                    style={{ top: y(from), height: Math.max(((to - from) / 60) * HOUR_PX, 14), background: c.bg, color: c.fg }}
                  >
                    {s.list}
                    <br />
                    <span className="text-[11px] font-medium">{`${(s.from ?? "00:00").slice(0, 2)}–${(s.to ?? "24:00").slice(0, 2)}`}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
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
  const asPage = (m: SignMedia): SignPage => ({
    url: `${signage.viewBase}${m.id}?fit=cover`,
    s: m.kind === "video" && m.durationMs ? Math.min(SIGN_SECONDS_MAX, Math.max(SIGN_SECONDS_MIN, Math.ceil(m.durationMs / 1000))) : null,
    media: m.id,
  });

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((p, i) => {
        const m = p.media ? byId.get(p.media) : undefined;
        return (
          <div key={i} className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-[12px] font-bold text-[#5a6270]">{i + 1}</span>
            {p.media ? (
              <span className={`${BOX} flex min-w-[120px] flex-1 items-center gap-2 py-0.5 pl-0.5 pr-1.5`}>
                <MediaThumb item={m} id={p.media} fileBase={signage.fileBase} />
                <span className="min-w-0 flex-1 truncate">{m ? m.name : "Filen finns inte längre"}</span>
                <select
                  aria-label={`${label}, sida ${i + 1}, storlek`}
                  value={p.url.includes("fit=contain") ? "contain" : "cover"}
                  onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, url: x.url.replace(/fit=(cover|contain)/, `fit=${e.target.value}`) } : x)))}
                  className="h-7 rounded-md bg-transparent px-1 text-[12.5px] text-[#5a6270]"
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
                className={`${BOX} min-w-[120px] flex-1 px-3`}
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
              className={`${BOX} w-16 shrink-0 px-2.5`}
            />
            <span className="flex w-[84px] justify-around">
              <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => commit(move(rows, i, -1))} className={ARROW}>↑</button>
              <button type="button" aria-label="Flytta ner" disabled={i === rows.length - 1} onClick={() => commit(move(rows, i, 1))} className={ARROW}>↓</button>
              <button type="button" aria-label={`Ta bort sida ${i + 1}`} onClick={() => commit(rows.filter((_, j) => j !== i))} className={ARROW}>×</button>
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 py-0.5">
        <button type="button" onClick={() => setRows((r) => [...r, { url: "", s: null }])} className={LINK}>+ Lägg till sida</button>
        <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className={LINK}>+ Bild, film eller pdf</button>
      </div>
      {picking && (
        <MediaPicker
          media={media}
          signage={signage}
          onPick={(items) => {
            commit([...rows, ...items.map(asPage)]);
            setPicking(false);
          }}
          onUploaded={onUploaded}
        />
      )}
    </div>
  );
}

function MediaThumb({ item, id, fileBase }: { item?: SignMedia; id: string; fileBase: string }) {
  const cls = "h-8 w-12 shrink-0 rounded-md bg-kth-navy object-cover";
  if (!item) return <span className={`${cls} flex items-center justify-center bg-bad-bg text-[10px] font-semibold text-bad-ink`}>Saknas</span>;
  return item.kind === "video" ? (
    <video src={`${fileBase}${id}#t=0.5`} muted preload="metadata" className={cls} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- ur mediebiblioteket, redan nedskalad
    <img src={`${fileBase}${id}`} alt="" loading="lazy" className={cls} />
  );
}

/** The media library to pick from, and upload (a pdf adds all its pages, in order) */
function MediaPicker({ media, signage, onPick, onUploaded }: { media: SignMedia[]; signage: SignageProps; onPick: (items: SignMedia[]) => void; onUploaded: (items: SignMedia[]) => void }) {
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
    <div className="flex flex-col gap-2 rounded-lg border border-[#d9dde2] bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={OUTLINE_BTN} disabled={!!busy} onClick={() => inputRef.current?.click()}>
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
        <span className="text-[12.5px] text-[#5a6270]">Bild, pdf (en sida per bild) eller film (MP4). Eller välj ur mediebiblioteket nedan.</span>
      </div>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-bad-ink">{error}</p>}
      {media.length ? (
        <div className="grid max-h-[280px] grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto">
          {media.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick([m])} className="flex flex-col gap-1 rounded-lg border border-[#d9dde2] p-1.5 text-left hover:border-kth-blue">
              <MediaThumb item={m} id={m.id} fileBase={signage.fileBase} />
              <span className="truncate text-[12px]">{m.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-[#5a6270]">Mediebiblioteket är tomt. Ladda upp en fil.</p>
      )}
    </div>
  );
}
