"use client";

import { useMemo, useRef, useState } from "react";
import {
  activeAt,
  activeList,
  addDays,
  dateState,
  dayBounds,
  nextChange,
  pageOn,
  parseSchedule,
  parseSignPages,
  serializeSchedule,
  serializeSignPages,
  SIGN_SECONDS_MAX,
  SIGN_SECONDS_MIN,
  slotOverlaps,
  slotProblem,
  stockholmNow,
  weekday,
  type DateState,
  type Schedule,
  type SignPage,
  type Slot,
} from "@/lib/signage";
import type { EditorField } from "./apps-editor";
import { createSnapAction, renderSnapAction, setSnapRefreshAction } from "@/app/(admin)/media/actions";
import { FieldControl } from "./field-control";
import { useMinute } from "./use-minute";

/** A file in the media library as the editor needs it (src/lib/media.ts MediaItem) */
export type SignMedia = { id: string; name: string; kind: "image" | "video"; durationMs: number | null };
/** Sida som bild as the editor needs it (src/lib/snap.ts SnapInfo) */
export type SignSnap = {
  id: string;
  url: string;
  width: number;
  height: number;
  /** 2: twice the pixels, for 4K screens */
  scale: number;
  refreshMin: number;
  renderedAt: string | null;
  error: string | null;
  errorAt: string | null;
};

export type SignageProps = {
  media: SignMedia[];
  snaps: SignSnap[];
  /** Absolute address of Sida som bild: <snapBase><id>?fit=cover (what the signs load) */
  snapBase: string;
  /** Its images in admin: <snapImageBase><id>/image */
  snapImageBase: string;
  /** Absolute address of the viewer pages: <viewBase><id>?fit=cover (what the kiosks load) */
  viewBase: string;
  /** The files themselves, for thumbnails in admin */
  fileBase: string;
  uploadUrl: string;
};

const SECTION = "flex flex-col gap-3 rounded-xl border border-[#d9dde2] bg-white px-5 py-[18px]";
// Ärvd från profilen eller grundinställningarna: streckad och tonad, som andra ärvda värden
const SECTION_INHERITED = "flex flex-col gap-3 rounded-xl border-2 border-dashed border-[#aeb6c0] bg-[#f1f3f5] px-5 py-[18px]";
const OUTLINE_BTN = "h-9 shrink-0 rounded-lg border-2 border-kth-blue bg-white px-3 text-[13px] font-bold text-kth-blue hover:bg-select disabled:opacity-40";
const BOX = "h-9 rounded-lg border border-[#c4cad2] bg-white text-[13.5px]";
const ARROW = "size-[26px] shrink-0 rounded text-[15px] text-[#5a6270] hover:bg-page disabled:opacity-30";
const LINK = "text-[13px] font-bold text-kth-blue";
const DAYS = ["M", "T", "O", "T", "F", "L", "S"];
const DAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
// En färg per spellista (i ordning), tydligt olika kulörer ur KTH:s palett; text i kontrast mot färgen
const COLORS = [
  { bg: "#004791", fg: "#ffffff" }, // blå
  { bg: "#ffbe00", fg: "#3a2600" }, // gul
  { bg: "#1f7a4d", fg: "#ffffff" }, // grön
  { bg: "#b8336a", fg: "#ffffff" }, // rosa
  { bg: "#1b7f86", fg: "#ffffff" }, // turkos
  { bg: "#e86a58", fg: "#3a0d06" }, // korall
  { bg: "#000061", fg: "#ffffff" }, // marin
  { bg: "#c4cad2", fg: "#1c1f24" }, // grå
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
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
/** "20–31 okt", "1 dec–6 jan", "från 20 okt", "till 31 okt" */
function rangeText(start?: string, end?: string): string {
  if (start && end) return start.slice(0, 7) === end.slice(0, 7) ? `${Number(start.slice(8))}–${shortDate(end)}` : `${shortDate(start)}–${shortDate(end)}`;
  if (start) return `från ${shortDate(start)}`;
  return end ? `till ${shortDate(end)}` : "alltid";
}
/** A page's dates as the "Visas" button says it, after its state today */
function datesText(start: string | undefined, end: string | undefined, state: DateState | null): string {
  if (!start && !end) return "Alltid";
  if (state === "coming") return `Börjar ${shortDate(start!)}${end ? ` · till ${shortDate(end)}` : ""}`;
  if (state === "active") return end ? `Visas till ${shortDate(end)}` : `Visas sedan ${shortDate(start!)}`;
  if (state === "expired") return `Slutade ${shortDate(end!)}`;
  return rangeText(start, end).replace(/^./, (c) => c.toUpperCase());
}
const DATE_CHIP: Record<DateState, string> = {
  always: "border border-dashed border-[#c4cad2] bg-white text-[#8a929d]",
  active: "border border-[#1f7a4d] bg-[#e8f5ee] text-[#155c39]",
  coming: "border-2 border-kth-blue bg-kth-light-blue text-kth-navy",
  expired: "border border-[#d0d5db] bg-[#eceef1] text-[#5a6270]",
};

/**
 * Skylt: what a sign shows and when, the same on Linux and Android (design "Skylt i admin").
 * Playlists and a schedule (SIGN_SCHEDULE), the standard list for when nothing in the schedule
 * applies (SIGN_PAGES), the time per page and scripts. Rows are web pages or library files.
 */
export function SignageEditor({
  schedule,
  pages,
  seconds,
  reload,
  js,
  resources,
  platform,
  signage,
  heading = true,
  status,
}: {
  /** Per part: set here, inherited (from which layer) or unsaved, with the way back (settings-editor keyStatus) */
  status?: (keys: string[]) => React.ReactNode;
  /** The block's own "Skylt" heading; off where the settings group already has it */
  heading?: boolean;
  schedule?: EditorField;
  pages: EditorField;
  seconds?: EditorField;
  /** SIGN_RELOAD: minutes between soft reloads when the list shown has a single page */
  reload?: EditorField;
  js?: EditorField;
  /** SIGN_RESOURCES: where the pages' scripts, fonts, images and requests may come from */
  resources?: EditorField;
  platform: string;
  signage: SignageProps;
}) {
  const [media, setMedia] = useState(signage.media);
  const addToLibrary = (items: SignMedia[]) => setMedia((m) => [...items.filter((x) => !m.some((y) => y.id === x.id)), ...m]);
  const [snaps, setSnaps] = useState(signage.snaps);
  const onSnap = (s: SignSnap) => setSnaps((all) => [s, ...all.filter((x) => x.id !== s.id)]);
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
  const fallback = platform === "android" ? "startsidan" : platform === "tizen" ? "en svart skärm" : "första Startsidan";

  // Visas nu och nästa byte, med samma regler som kioskerna; bara i webbläsaren (useMinute)
  const now = useMinute();
  const today = now ? stockholmNow(now).date : null;
  const active = now ? activeList(sched, now) : null;
  const next = useMemo(() => (now ? nextChange(sched, now) : null), [sched, now]);
  const describe = (a: ReturnType<typeof activeList>) =>
    a.kind === "list" ? a.name : a.kind === "off" ? "svart skärm" : std.some((p) => !today || pageOn(p, today)) ? "standardlistan" : fallback;
  const shownPages = (a: ReturnType<typeof activeList>) => (a.kind === "list" ? sched.lists[a.name] : a.kind === "standard" ? std : []);
  // "3 av 5 sidor (2 har andra datum)" och nästa datumhändelse i den listan
  const countText = (a: ReturnType<typeof activeList>) => {
    const all = shownPages(a);
    const on = today ? all.filter((p) => pageOn(p, today)).length : all.length;
    if (!all.length || (!on && a.kind === "standard")) return null;
    return on === all.length ? `${pagesText(on)} i tur och ordning` : `${on} av ${pagesText(all.length)} (${all.length - on} har andra datum)`;
  };
  const byId = new Map(media.map((m) => [m.id, m]));
  const snapById = new Map(snaps.map((x) => [x.id, x]));
  const nameOf = (p: SignPage) => pageName(p, byId, snapById);
  const dateEvent = (a: ReturnType<typeof activeList>) => {
    if (!today) return null;
    const events = shownPages(a).flatMap((p) => [
      ...(p.start && p.start > today ? [{ date: p.start, text: `${nameOf(p)} börjar ${shortDate(p.start)}` }] : []),
      ...(p.end && p.end >= today && (!p.start || p.start <= today) ? [{ date: p.end, text: `${nameOf(p)} visas till ${shortDate(p.end)}` }] : []),
    ]);
    return events.sort((x, y) => x.date.localeCompare(y.date))[0]?.text ?? null;
  };
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
    const periods = Object.fromEntries(Object.entries(sched.periods).map(([n, p]) => [n === from ? name : n, p]));
    writeSchedule({ ...sched, lists, periods, slots: sched.slots.map((s) => (s.list === from ? { ...s, list: name } : s)) });
    setOpen(name);
  };
  const removeList = (name: string) => {
    const used = sched.slots.filter((s) => s.list === name).length;
    if (used && !confirm(`${name} används i ${used} ${used === 1 ? "tid" : "tider"} i schemat. Ta bort listan och de tiderna?`)) return;
    const lists = { ...sched.lists };
    const periods = { ...sched.periods };
    delete lists[name];
    delete periods[name];
    writeSchedule({ ...sched, lists, periods, slots: sched.slots.filter((s) => s.list !== name) });
    setOpen(null);
  };
  const setPeriod = (name: string, period: [string, string] | undefined) => {
    const periods = { ...sched.periods };
    if (period) periods[name] = period;
    else delete periods[name];
    writeSchedule({ ...sched, periods });
  };
  const expired = (list: SignPage[]) => (today ? list.filter((p) => dateState(p.start, p.end, today) === "expired").length : 0);
  const overlaps = slotOverlaps(sched);
  const hasDates = std.some((p) => p.start || p.end) || Object.keys(sched.periods).length > 0 || sched.slots.some((s) => s.dates) || Object.values(sched.lists).some((l) => l.some((p) => p.start || p.end));
  const spellistor = useRef<HTMLElement>(null);
  const openFromCalendar = (name: string) => {
    setOpen(name);
    spellistor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Saker som datumen gör oanvändbara: listor där alla sidor har slutat, tider vars lista har slutat gälla
  const dateNotes = today
    ? [
        ...names.filter((n) => sched.lists[n].length && expired(sched.lists[n]) === sched.lists[n].length).map((n) => `Alla sidor i ${n} har slutat visas.`),
        ...names
          .filter((n) => sched.periods[n] && sched.periods[n][1] < today && sched.slots.some((s) => s.list === n))
          .map((n) => `${n} slutade gälla ${shortDate(sched.periods[n][1])}, så tiderna som pekar på den används inte.`),
      ]
    : [];

  return (
    <div className="@container flex flex-col gap-3.5">
      {heading && (
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[19px] font-extrabold text-kth-navy">Skylt</h3>
          <span className="text-[13px] text-[#5a6270]">Vad skärmen visar och när</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl bg-kth-navy px-[18px] py-3.5 text-white">
        <span className="text-[12px] font-bold uppercase tracking-[.06em] text-kth-light-blue">Visas nu</span>
        <span className="text-[17px] font-extrabold">
          {active
            ? active.kind === "list"
              ? active.name
              : active.kind === "off"
                ? "Svart skärm"
                : std.some((p) => !today || pageOn(p, today))
                  ? "Standardlistan"
                  : `Ingen sida (${fallback})`
            : "…"}
        </span>
        {active && now && (
          <span className="text-[14px] text-kth-light-blue">
            {[`${sthlm(now, { weekday: "long" })} ${sthlm(now, { day: "numeric", month: "short" }).replace(".", "")} ${sthlm(now, { hour: "2-digit", minute: "2-digit" })}`, countText(active), nextText, dateEvent(active)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>

      {schedule && (
        <section className={schedule.inherited ? SECTION_INHERITED : SECTION}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Schema</h4>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">Vilken spellista som visas när. Datumrader går före veckorader, annars gäller den översta som passar.</p>
              {status && <div className="mt-2">{status([schedule.meta.key])}</div>}
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
            <>
              <p className="text-[13px] text-[#5a6270]">Inget schema: skylten visar standardlistan hela tiden.</p>
              {hasDates && today && <Calendar schedule={sched} std={std} today={today} color={color} nameOf={nameOf} onOpenList={openFromCalendar} />}
            </>
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
              {today ? <Calendar schedule={sched} std={std} today={today} color={color} nameOf={nameOf} onOpenList={openFromCalendar} /> : <WeekView schedule={sched} color={color} />}
            </>
          )}
        </section>
      )}

      {schedule && (
        <section ref={spellistor} className={`scroll-mt-4 ${schedule.inherited ? SECTION_INHERITED : SECTION}`}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h4 className="text-[15px] font-extrabold">Spellistor</h4>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">Sidor som visas i tur och ordning. En sida eller en hel lista kan ha datum: utanför dem hoppas den över. Sekunder tomt: Tid per sida.</p>
              {status && <div className="mt-2">{status([schedule.meta.key])}</div>}
            </div>
            <button type="button" className={OUTLINE_BTN} onClick={addList}>+ Ny spellista</button>
          </div>
          {names.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Spellistor">
              {names.map((n) => {
                const period = sched.periods[n];
                const state = period && today ? dateState(period[0], period[1], today) : null;
                return (
                  <button
                    key={n}
                    type="button"
                    role="tab"
                    aria-selected={openList === n}
                    onClick={() => setOpen(n)}
                    className={`inline-flex h-8 items-center gap-[7px] rounded-full px-3 text-[13px] font-bold ${openList === n ? "border-2 border-kth-blue bg-kth-light-blue text-kth-navy" : "border border-[#c4cad2] bg-white text-[#3d444d]"} ${state === "expired" && openList !== n ? "opacity-55" : ""}`}
                  >
                    <span className="size-2.5 rounded-[3px]" style={{ background: color(n).bg }} aria-hidden="true" />
                    {n}
                    <span className="font-medium opacity-75">
                      {period ? (state === "expired" ? `slutade ${shortDate(period[1])}` : rangeText(period[0], period[1])) : pagesText(sched.lists[n].length)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {openList && (
            <div className="flex flex-col gap-1.5 rounded-[10px] bg-[#f6f8fa] p-3">
              <ListHeader
                key={openList}
                name={openList}
                taken={names}
                expired={expired(sched.lists[openList])}
                onPurge={() => writeSchedule({ ...sched, lists: { ...sched.lists, [openList]: sched.lists[openList].filter((p) => !today || dateState(p.start, p.end, today) !== "expired") } })}
                onRename={(to) => renameList(openList, to)}
                onRemove={() => removeList(openList)}
              />
              <ListPeriod key={`p-${openList}`} period={sched.periods[openList]} today={today} onChange={(p) => setPeriod(openList, p)} />
              <PageList
                pages={sched.lists[openList]}
                onChange={(next) => writeSchedule({ ...sched, lists: { ...sched.lists, [openList]: next } })}
                media={media}
                onUploaded={addToLibrary}
                snaps={snaps}
                onSnap={onSnap}
                signage={signage}
                label={openList}
                today={today}
              />
            </div>
          )}
          {dateNotes.map((n) => <p key={n} className="text-[12.5px] font-semibold text-warn-ink">{n}</p>)}
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
            {std.length > 0 && today && !std.some((p) => pageOn(p, today)) ? `Ingen sida visas i dag: skylten visar ${fallback}.` : ""}
          </p>
          {status && <div className="mt-2">{status([pages.meta.key])}</div>}
        </div>
        <div className={`flex min-w-0 flex-col gap-2 ${pages.inherited ? "rounded-lg border-2 border-dashed border-[#aeb6c0] bg-[#f1f3f5] p-2" : ""}`}>
          <PageList pages={std} onChange={writeStd} media={media} onUploaded={addToLibrary} snaps={snaps} onSnap={onSnap} signage={signage} label="Standardlistan" today={today} purge />
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
              <div className="mt-1.5">{status?.([seconds.meta.key])}</div>
            </div>
          </>
        )}
        {reload && (
          <>
            <div>
              <label htmlFor={`f-${reload.meta.key}`} className="text-[15px] font-extrabold">{reload.meta.label}</label>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">
                Minuter, bara när listan som visas har en enda sida: den laddas om i bakgrunden och byts in när den är klar, så att en Sida som bild får en ny bild. 0: aldrig.
              </p>
            </div>
            <div className="max-w-[260px]">
              <FieldControl {...reload} invalid={!!reload.problem} />
              {reload.problem && <p className="mt-1 text-[12.5px] font-semibold text-bad-ink">{reload.problem}</p>}
              <div className="mt-1.5">{status?.([reload.meta.key])}</div>
            </div>
          </>
        )}
        {js && (
          <>
            <div>
              <label htmlFor={`f-${js.meta.key}`} className="text-[15px] font-extrabold">Sidorna får köra JavaScript</label>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">På som standard, eftersom skyltsidor oftast behöver skript.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-9 items-center">
                <FieldControl {...js} invalid={!!js.problem} />
              </div>
              {status?.([js.meta.key])}
            </div>
          </>
        )}
        {resources && (
          <>
            <div>
              <label htmlFor={`f-${resources.meta.key}`} className="text-[15px] font-extrabold">{resources.meta.label}</label>
              <p className="mt-[3px] text-[13px] text-[#5a6270]">Varifrån sidornas skript, typsnitt, bilder och anrop får hämtas. Själva sidorna är alltid de i listorna.</p>
            </div>
            <div className="flex max-w-[320px] flex-col gap-1.5">
              <FieldControl {...resources} invalid={!!resources.problem} />
              {status?.([resources.meta.key])}
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

function ListHeader({
  name,
  taken,
  expired,
  onPurge,
  onRename,
  onRemove,
}: {
  name: string;
  taken: string[];
  expired: number;
  onPurge: () => void;
  onRename: (to: string) => void;
  onRemove: () => void;
}) {
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
      {expired > 0 && <button type="button" className="text-[12.5px] font-bold text-kth-blue" onClick={onPurge}>Ta bort utgångna ({expired})</button>}
      <button type="button" className="text-[12.5px] font-bold text-[#a1271d]" onClick={onRemove}>Ta bort listan</button>
    </div>
  );
}

/** Mon–Sun with the weekly times as blocks (07–22, wider if a time is outside); date rows in the legend */
function WeekView({ schedule, color, heading = true }: { schedule: Schedule; color: (n: string) => { bg: string; fg: string }; heading?: boolean }) {
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
        {heading ? <h5 className="text-[14px] font-extrabold">Veckan</h5> : <span />}
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
  snaps,
  onSnap,
  signage,
  label,
  today,
  purge = false,
}: {
  pages: SignPage[];
  onChange: (next: SignPage[]) => void;
  media: SignMedia[];
  onUploaded: (items: SignMedia[]) => void;
  snaps: SignSnap[];
  onSnap: (s: SignSnap) => void;
  signage: SignageProps;
  label: string;
  /** Stockholm date in the browser (null on the server): the rows' date colors */
  today: string | null;
  /** Ta bort utgångna in the list's own link row (the standard list; playlists have it in the header) */
  purge?: boolean;
}) {
  // Adresser skrivs lokalt och sparas när fältet lämnas, så att varje tangent inte blir ett utkast
  const [rows, setRows] = useState(pages);
  const [seen, setSeen] = useState(pages);
  if (pages !== seen && JSON.stringify(pages) !== JSON.stringify(seen)) {
    setSeen(pages);
    setRows(pages);
  }
  const [picking, setPicking] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [dating, setDating] = useState<number | null>(null);
  const snapById = new Map(snaps.map((x) => [x.id, x]));
  const expired = today ? rows.filter((p) => dateState(p.start, p.end, today) === "expired").length : 0;
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
    <div className="@container/pl flex flex-col gap-1.5">
      {rows.length > 0 && (
        <div className="hidden items-center gap-1.5 text-[12px] font-bold text-[#5a6270] @xl/pl:flex">
          <span className="w-4" />
          <span className="flex-1">Sida</span>
          <span className="w-[170px]">Visas</span>
          <span className="w-16">Sek</span>
          <span className="w-[84px]" />
        </div>
      )}
      {rows.map((p, i) => {
        const m = p.media ? byId.get(p.media) : undefined;
        const sid = snapIdOf(p.url);
        const state = today ? dateState(p.start, p.end, today) : null;
        const fitSelect = (
          <select
            aria-label={`${label}, sida ${i + 1}, storlek`}
            value={p.url.includes("fit=contain") ? "contain" : "cover"}
            onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, url: x.url.replace(/fit=(cover|contain)/, `fit=${e.target.value}`) } : x)))}
            className="h-7 rounded-md bg-transparent px-1 text-[12.5px] text-[#5a6270]"
          >
            <option value="cover">Fyll skärmen</option>
            <option value="contain">Hela bilden</option>
          </select>
        );
        return (
          <div key={i} className={`relative flex w-full min-w-0 flex-wrap items-center gap-1.5 ${state === "expired" ? "opacity-55" : ""}`}>
            <span className="w-4 shrink-0 text-center text-[12px] font-bold text-[#5a6270]">{i + 1}</span>
            {sid ? (
              <SnapRowBox id={sid} snap={snapById.get(sid)} signage={signage} onSnap={onSnap} fitSelect={fitSelect} />
            ) : p.media ? (
              <span className={`${BOX} flex min-w-[120px] flex-1 items-center gap-2 py-0.5 pl-0.5 pr-1.5`}>
                <MediaThumb item={m} id={p.media} fileBase={signage.fileBase} enlarge />
                <span className="min-w-0 flex-1 truncate">{m ? m.name : "Filen finns inte längre"}</span>
                {fitSelect}
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
            <button
              type="button"
              aria-expanded={dating === i}
              aria-label={`${label}, sida ${i + 1}, visas: ${datesText(p.start, p.end, state)}`}
              onClick={() => setDating(dating === i ? null : i)}
              className={`flex h-9 w-[170px] shrink-0 items-center truncate rounded-lg px-2.5 text-left text-[12.5px] font-semibold ${DATE_CHIP[state ?? (p.start || p.end ? "coming" : "always")]}`}
            >
              {datesText(p.start, p.end, state)}
            </button>
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
            {dating === i && (
              <DatesPopover
                title={`När visas ${pageName(p, byId, snapById)}?`}
                subtitle={`Sida ${i + 1} i ${label}`}
                start={p.start}
                end={p.end}
                today={today}
                onCancel={() => setDating(null)}
                onDone={(start, end) => {
                  commit(rows.map((x, j) => (j === i ? withDates(x, start, end) : x)));
                  setDating(null);
                }}
              />
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-4 py-0.5">
        <button type="button" onClick={() => setRows((r) => [...r, { url: "", s: null }])} className={LINK}>+ Lägg till sida</button>
        <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking} className={LINK}>+ Bild, film eller pdf</button>
        <button type="button" onClick={() => setSnapping((p) => !p)} aria-expanded={snapping} className={LINK}>+ Sida som bild</button>
        {purge && expired > 0 && (
          <button type="button" onClick={() => commit(rows.filter((p) => dateState(p.start, p.end, today!) !== "expired"))} className={LINK}>
            Ta bort utgångna ({expired})
          </button>
        )}
      </div>
      {snapping && (
        <SnapForm
          onCancel={() => setSnapping(false)}
          onAdded={(snap) => {
            onSnap(snap);
            commit([...rows, { url: `${signage.snapBase}${snap.id}?fit=cover`, s: null }]);
            setSnapping(false);
          }}
        />
      )}
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

/** enlarge: a click shows the file large (in a list row; not in the picker, where a click picks it) */
function MediaThumb({ item, id, fileBase, enlarge = false }: { item?: SignMedia; id: string; fileBase: string; enlarge?: boolean }) {
  const cls = "h-8 w-12 shrink-0 rounded-md bg-kth-navy object-cover";
  if (!item) return <span className={`${cls} flex items-center justify-center bg-bad-bg text-[10px] font-semibold text-bad-ink`}>Saknas</span>;
  const thumb =
    item.kind === "video" ? (
      <video src={`${fileBase}${id}#t=0.5`} muted preload="metadata" className={cls} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- ur mediebiblioteket, redan nedskalad
      <img src={`${fileBase}${id}`} alt="" loading="lazy" className={cls} />
    );
  return enlarge ? (
    <Enlarge src={`${fileBase}${id}`} kind={item.kind} title={item.name}>
      {thumb}
    </Enlarge>
  ) : (
    thumb
  );
}

/**
 * A thumbnail that shows the picture (or film) large when clicked, in a modal box over the page;
 * Esc, Stäng or a click beside it closes it.
 */
function Enlarge({ src, kind, title, children }: { src: string; kind: "image" | "video"; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  return (
    <>
      <button type="button" onClick={show} title="Visa större" aria-label={`Visa ${title} större`} className="shrink-0 cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-kth-blue">
        {children}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
        aria-label={title}
        className="m-auto max-h-[92vh] max-w-[92vw] rounded-xl bg-white p-0 shadow-2xl backdrop:bg-[rgba(20,24,32,.6)]"
      >
        {/* w-0 min-w-full: rubriken följer bildens bredd i stället för att göra rutan bredare */}
        <div className="flex w-0 min-w-full items-center justify-between gap-4 px-4 py-2.5">
          <span className="min-w-0 truncate text-[14px] font-bold" title={title}>{title}</span>
          <button type="button" onClick={() => ref.current?.close()} className="shrink-0 text-[13px] font-bold text-kth-blue">Stäng</button>
        </div>
        {open &&
          (kind === "video" ? (
            <video src={src} controls autoPlay muted loop playsInline className="block max-h-[calc(92vh_-_48px)] max-w-[92vw] bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- ur mediebiblioteket eller renderad av publicomtools
            <img src={src} alt="" className="block max-h-[calc(92vh_-_48px)] max-w-[92vw] bg-kth-navy object-contain" />
          ))}
      </dialog>
    </>
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

/** A page with new dates (missing ones removed) */
function withDates(p: SignPage, start?: string, end?: string): SignPage {
  const next = { ...p, start, end };
  if (!start) delete next.start;
  if (!end) delete next.end;
  return next;
}

const bareUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** What a row is called in texts: the file's name, the page behind a Sida som bild, or the address */
function pageName(p: SignPage, byId: Map<string, SignMedia>, snapById: Map<string, SignSnap>): string {
  if (p.media) return byId.get(p.media)?.name ?? "filen";
  const sid = snapIdOf(p.url);
  if (sid) return snapById.get(sid) ? bareUrl(snapById.get(sid)!.url) : "sidan som bild";
  return bareUrl(p.url) || "sidan";
}

/** The id of a Sida som bild row (/api/sign/s/<id>), or null */
function snapIdOf(url: string): string | null {
  return /\/api\/sign\/s\/([a-z0-9]{20,32})(?:[?#]|$)/.exec(url)?.[1] ?? null;
}

const clock = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
const dayClock = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

/** A Sida som bild row: the latest image, the page behind it, and how the latest render went */
function SnapRowBox({ id, snap, signage, onSnap, fitSelect }: { id: string; snap?: SignSnap; signage: SignageProps; onSnap: (s: SignSnap) => void; fitSelect: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = useMinute();
  const old = snap?.renderedAt && now ? now.getTime() - Date.parse(snap.renderedAt) > 3 * snap.refreshMin * 60_000 : false;
  const failed = !!snap?.error && (!snap.renderedAt || (snap.errorAt ?? "") > snap.renderedAt);
  const status = !snap
    ? "Finns inte längre"
    : !snap.renderedAt
      ? failed
        ? `Ingen bild: ${snap.error}`
        : "Ingen bild än"
      : `${now && Date.parse(snap.renderedAt) > now.getTime() - 20 * 3600_000 ? `Bild kl ${clock(snap.renderedAt)}` : `Bild ${dayClock(snap.renderedAt)}`}${failed ? ` · senaste försöket misslyckades: ${snap.error}` : ""}`;
  const setRefresh = async (refreshMin: number) => {
    setSaving(true);
    try {
      const res = await setSnapRefreshAction(id, refreshMin);
      if (res.ok) onSnap(res.snap);
    } finally {
      setSaving(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const res = await renderSnapAction(id);
      if (res.ok) onSnap(res.snap);
    } finally {
      setBusy(false);
    }
  };
  const portrait = snap ? snap.height > snap.width : false;
  const bad = failed || old || !snap;
  return (
    <>
      <span className={`${BOX} flex min-w-[160px] flex-1 items-center gap-2 py-0.5 pl-0.5 pr-1.5`}>
        {snap?.renderedAt ? (
          <Enlarge
            src={`${signage.snapImageBase}${id}/image?v=${Date.parse(snap.renderedAt)}`}
            kind="image"
            title={`${bareUrl(snap.url)}, bild kl ${clock(snap.renderedAt)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- renderad av publicomtools själv */}
            <img src={`${signage.snapImageBase}${id}/image?v=${Date.parse(snap.renderedAt)}`} alt="" loading="lazy" className={`block shrink-0 rounded bg-kth-navy object-cover ${portrait ? "h-8 w-[18px]" : "h-8 w-12"}`} />
          </Enlarge>
        ) : (
          <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-[#eceef1] text-[10px] font-semibold text-[#5a6270]">Bild</span>
        )}
        <span className="min-w-0 flex-1 truncate" title={snap?.url}>{snap ? bareUrl(snap.url) : "Sida som bild"}</span>
        {fitSelect}
      </span>
      {/* Hur senaste bilden gick, på en egen rad under raden */}
      <span className={`order-last flex basis-full items-center gap-2 pl-[22px] text-[12px] ${bad ? "font-semibold text-bad-ink" : "text-[#5a6270]"}`}>
        <span className="min-w-0 truncate" title={status}>
          {snap && `Sida som bild, ${portrait ? "stående" : "liggande"}${snap.scale === 2 ? ", 4K" : ""} · `}
          {old && !failed ? `Gammal bild: ${status}` : status}
        </span>
        {snap && (
          // Intervallet hör till bilden (adress och orientering), inte till raden: sparas direkt
          <label className="flex shrink-0 items-center gap-1 font-normal text-[#5a6270]" title="Gäller bilden i alla spellistor som visar samma adress och orientering. Sparas direkt.">
            ny bild var
            <select
              aria-label="Ny bild var"
              value={snap.refreshMin}
              disabled={saving}
              onChange={(e) => setRefresh(Number(e.target.value))}
              className="h-6 rounded border border-[#c4cad2] bg-white px-1 text-[12px] text-ink disabled:opacity-50"
            >
              {[1, 2, 5, 10, 30, 60].map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
        )}
        {snap && (
          <button type="button" onClick={refresh} disabled={busy} title="Ta en ny bild nu" className="shrink-0 font-bold text-kth-blue disabled:opacity-50">
            {busy ? "Tar bild…" : "Uppdatera nu"}
          </button>
        )}
      </span>
    </>
  );
}

/** + Sida som bild: the address, orientation and how often; the first image is taken at once */
function SnapForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: (s: SignSnap) => void }) {
  const [url, setUrl] = useState("");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [refreshMin, setRefreshMin] = useState(5);
  const [scale, setScale] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await createSnapAction({ url, orientation, refreshMin, scale });
      if (!res.ok) setError(res.error);
      else onAdded(res.snap);
    } catch {
      setError("Det gick inte att nå servern. Försök igen.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-[#d9dde2] bg-white p-3">
      <p className="text-[12.5px] text-[#5a6270]">
        Publicomtools öppnar sidan och tar en bild av den, som skylten visar i stället för sidan. För skärmar vars webbläsare inte klarar sidan (Samsung Tizen 4.0). Bilden står still mellan uppdateringarna.
      </p>
      <input
        type="url"
        value={url}
        placeholder="https://apps.lib.kth.se/smartsigntools/…"
        aria-label="Sidans adress"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && add()}
        className={`${BOX} px-3`}
      />
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {(["landscape", "portrait"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={orientation === o} onClick={() => setOrientation(o)} className={pill(orientation === o)}>
            {o === "landscape" ? "Liggande 1920×1080" : "Stående 1080×1920"}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={scale === 2}
          onClick={() => setScale((x) => (x === 2 ? 1 : 2))}
          title="Samma sida med dubbelt så många pixlar: skarp text på 4K-skärmar (t.ex. 55 tum). Större fil, tar lite längre tid."
          className={pill(scale === 2)}
        >
          Dubbel upplösning (4K-skärmar)
        </button>
        <label className="ml-1 flex items-center gap-1.5 text-[#5a6270]">
          Ny bild var
          <select value={refreshMin} onChange={(e) => setRefreshMin(Number(e.target.value))} className="h-[30px] rounded-md border border-[#c4cad2] bg-white px-1.5 text-ink">
            {[1, 2, 5, 10, 30, 60].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-[12.5px] font-semibold text-bad-ink">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !url.trim()} onClick={add} className="h-[34px] rounded-lg bg-kth-blue px-3.5 text-[13px] font-bold text-white disabled:opacity-40">
          {busy ? "Tar första bilden…" : "Lägg till"}
        </button>
        <button type="button" onClick={onCancel} className="h-[34px] rounded-lg border border-[#c4cad2] bg-white px-3 text-[13px] font-semibold">Avbryt</button>
      </div>
    </div>
  );
}

type DateMode = "always" | "from" | "to" | "between";
const DATE_MODES: [DateMode, string][] = [
  ["always", "Alltid"],
  ["from", "Från ett datum"],
  ["to", "Till ett datum"],
  ["between", "Mellan två datum"],
];
const PILL = "inline-flex h-[30px] items-center rounded-full px-[11px] text-[12.5px]";
const pill = (on: boolean) => `${PILL} ${on ? "bg-kth-blue font-bold text-white" : "border border-[#c4cad2] font-semibold"}`;
const DATE_INPUT = "h-9 w-[150px] rounded-lg border border-[#c4cad2] bg-white px-2.5 text-[13.5px] text-ink";

/** The small box under a page's Visas button: mode, the dates and quick choices */
function DatesPopover({
  title,
  subtitle,
  start,
  end,
  today,
  onCancel,
  onDone,
}: {
  title: string;
  subtitle: string;
  start?: string;
  end?: string;
  today: string | null;
  onCancel: () => void;
  onDone: (start?: string, end?: string) => void;
}) {
  const [mode, setMode] = useState<DateMode>(start && end ? "between" : start ? "from" : end ? "to" : "always");
  const base = today ?? new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(start ?? base);
  const [to, setTo] = useState(end ?? (start && start > base ? addDays(start, 6) : addDays(base, 6)));
  const useFrom = mode === "from" || mode === "between";
  const useTo = mode === "to" || mode === "between";
  const backwards = mode === "between" && from > to;
  const quick = (a: string, b: string) => {
    setMode("between");
    setFrom(a);
    setTo(b);
  };
  const sunday = addDays(base, 7 - weekday(base));
  const monthEnd = addDays(`${addDays(`${base.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  return (
    <div
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="absolute right-[90px] top-[42px] z-20 flex w-[470px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-xl border border-[#c4cad2] bg-white px-[18px] py-4 shadow-[0_12px_32px_rgba(0,0,40,.18)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h5 className="min-w-0 truncate text-[14px] font-extrabold">{title}</h5>
        <span className="shrink-0 text-[12px] text-[#5a6270]">{subtitle}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DATE_MODES.map(([m, text]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={pill(mode === m)}>
            {text}
          </button>
        ))}
      </div>
      {mode !== "always" && (
        <div className="flex flex-wrap items-end gap-2 text-[13px] text-[#5a6270]">
          {useFrom && (
            <label className="flex flex-col gap-1">
              Från och med
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE_INPUT} />
            </label>
          )}
          {useTo && (
            <label className="flex flex-col gap-1">
              Till och med
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE_INPUT} />
            </label>
          )}
        </div>
      )}
      {backwards && <p className="text-[12.5px] font-semibold text-bad-ink">Sista dagen måste vara samma dag eller efter den första.</p>}
      <div className="flex flex-wrap gap-3 text-[12.5px]">
        <span className="text-[#5a6270]">Snabbval:</span>
        <button type="button" className="font-bold text-kth-blue" onClick={() => quick(base, sunday)}>Den här veckan</button>
        <button type="button" className="font-bold text-kth-blue" onClick={() => quick(addDays(sunday, 1), addDays(sunday, 7))}>Nästa vecka</button>
        <button type="button" className="font-bold text-kth-blue" onClick={() => quick(base, monthEnd)}>Resten av månaden</button>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-[34px] rounded-lg border border-[#c4cad2] bg-white px-3 text-[13px] font-semibold">Avbryt</button>
        <button
          type="button"
          disabled={backwards || (useFrom && !from) || (useTo && !to)}
          onClick={() => onDone(useFrom ? from : undefined, useTo ? to : undefined)}
          className="h-[34px] rounded-lg bg-kth-blue px-3.5 text-[13px] font-bold text-white disabled:opacity-40"
        >
          Klar
        </button>
      </div>
    </div>
  );
}

/** Gäller: a whole playlist used only between two dates (SIGN_SCHEDULE.periods) */
function ListPeriod({ period, today, onChange }: { period?: [string, string]; today: string | null; onChange: (p: [string, string] | undefined) => void }) {
  const base = today ?? new Date().toISOString().slice(0, 10);
  const state = period && today ? dateState(period[0], period[1], today) : null;
  const badge =
    state === "coming"
      ? { text: `Börjar om ${daysBetween(today!, period![0])} ${daysBetween(today!, period![0]) === 1 ? "dag" : "dagar"}`, cls: "bg-kth-light-blue text-kth-navy" }
      : state === "active"
        ? { text: `Gäller nu, till ${shortDate(period![1])}`, cls: "bg-[#e8f5ee] text-[#155c39]" }
        : state === "expired"
          ? { text: `Slutade ${shortDate(period![1])}`, cls: "bg-[#eceef1] text-[#5a6270]" }
          : null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-[#5a6270]">
      <span className="font-bold text-ink">Gäller</span>
      <button type="button" aria-pressed={!period} onClick={() => onChange(undefined)} className={pill(!period)}>Alltid</button>
      <button type="button" aria-pressed={!!period} onClick={() => !period && onChange([base, addDays(base, 13)])} className={pill(!!period)}>Mellan två datum</button>
      {period && (
        <>
          <input type="date" aria-label="Spellistan gäller från och med" value={period[0]} onChange={(e) => e.target.value && onChange([e.target.value, period[1]])} className={DATE_INPUT} />
          –
          <input type="date" aria-label="Spellistan gäller till och med" value={period[1]} onChange={(e) => e.target.value && onChange([period[0], e.target.value])} className={DATE_INPUT} />
          {badge && <span className={`inline-flex h-[26px] items-center rounded-md px-[9px] text-[12px] font-bold ${badge.cls}`}>{badge.text}</span>}
        </>
      )}
    </div>
  );
}

const MONTHS = ["Januari", "Februari", "Mars", "April", "Maj", "Juni", "Juli", "Augusti", "September", "Oktober", "November", "December"];

/** Vecka | Månad: the week grid, or the month with what each day shows and a timeline of everything with dates */
function Calendar({
  schedule,
  std,
  today,
  color,
  nameOf,
  onOpenList,
}: {
  schedule: Schedule;
  std: SignPage[];
  today: string;
  color: (n: string) => { bg: string; fg: string };
  nameOf: (p: SignPage) => string;
  onOpenList: (name: string) => void;
}) {
  const [view, setView] = useState<"week" | "month">(schedule.slots.length ? "week" : "month");
  const [offset, setOffset] = useState(0);
  const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7)) - 1 + offset;
  const year = y0 + Math.floor(m0 / 12), month = ((m0 % 12) + 12) % 12;
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const days = Number(addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1).slice(8));
  const last = `${first.slice(0, 8)}${String(days).padStart(2, "0")}`;
  const TAB = "inline-flex h-[26px] items-center rounded-[7px] px-2.5 text-[12.5px]";
  return (
    <div className="mt-1.5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h5 className="text-[14px] font-extrabold">Kalender</h5>
        <span className="inline-flex gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]" role="group" aria-label="Visa">
          {(["week", "month"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`${TAB} ${view === v ? "bg-white font-bold shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "font-semibold text-[#3d444d]"}`}>
              {v === "week" ? "Vecka" : "Månad"}
            </button>
          ))}
        </span>
        <span className="flex-1" />
        {view === "month" && (
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Föregående månad" onClick={() => setOffset((o) => o - 1)} className="size-8 rounded-lg border border-[#c4cad2] bg-white text-[15px]">‹</button>
            <button type="button" onClick={() => setOffset(0)} title="Den här månaden" className="min-w-[120px] text-center text-[15px] font-extrabold">{MONTHS[month]} {year}</button>
            <button type="button" aria-label="Nästa månad" onClick={() => setOffset((o) => o + 1)} className="size-8 rounded-lg border border-[#c4cad2] bg-white text-[15px]">›</button>
          </span>
        )}
      </div>
      {view === "week" ? (
        <WeekView schedule={schedule} color={color} heading={false} />
      ) : (
        <>
          <MonthGrid schedule={schedule} std={std} first={first} days={days} today={today} color={color} nameOf={nameOf} />
          <Timeline schedule={schedule} std={std} first={first} last={last} days={days} today={today} month={MONTHS[month].toLowerCase()} color={color} nameOf={nameOf} onOpenList={onOpenList} />
        </>
      )}
    </div>
  );
}

/** Mon–Sun for a month: a colored bar per list the sign shows that day, and what starts or ends */
function MonthGrid({
  schedule,
  std,
  first,
  days,
  today,
  color,
  nameOf,
}: {
  schedule: Schedule;
  std: SignPage[];
  first: string;
  days: number;
  today: string;
  color: (n: string) => { bg: string; fg: string };
  nameOf: (p: SignPage) => string;
}) {
  const bounds = useMemo(() => dayBounds(schedule), [schedule]);
  const lead = weekday(first) - 1;
  const cells = Math.ceil((lead + days) / 7) * 7;
  const all = [...std, ...Object.values(schedule.lists).flat()];
  const used = new Set<string>();
  const grid = Array.from({ length: cells }, (_, i) => {
    const n = i - lead + 1;
    if (n < 1 || n > days) return null;
    const date = addDays(first, n - 1);
    // Vad skylten visar under dagen: activeAt vid varje gräns (midnatt och tidernas från/till)
    const lists = [...new Set(bounds.map((min) => activeAt(schedule, { day: weekday(date), min, date })).flatMap((a) => (a.kind === "list" ? [a.name] : [])))];
    lists.forEach((l) => used.add(l));
    const tags = [
      ...Object.entries(schedule.periods).flatMap(([n, [a, b]]) => [...(a === date ? [`${n} börjar`] : []), ...(b === date ? [`${n} sista dagen`] : [])]),
      ...all.flatMap((p) => [...(p.start === date ? [`${nameOf(p)} börjar`] : []), ...(p.end === date ? [`${nameOf(p)} sista dagen`] : [])]),
    ];
    return { n, date, lists, tags };
  });
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => <span key={d} className="pb-0.5 text-center text-[12px] font-bold text-[#3d444d]">{d}</span>)}
        {grid.map((c, i) =>
          c ? (
            <div
              key={i}
              className={`flex min-h-[74px] min-w-0 flex-col gap-[5px] rounded-lg px-[7px] py-1.5 ${c.date === today ? "border-2 border-[#a1271d] bg-white" : "border border-[#e0e4e9] bg-white"}`}
            >
              <span className={`text-[12.5px] ${c.date === today ? "font-extrabold text-[#a1271d]" : "font-semibold"}`}>{c.n}</span>
              <span className="flex flex-wrap gap-[3px]">
                {c.lists.map((l) => <span key={l} title={l} className="h-1.5 w-[18px] rounded-[3px]" style={{ background: color(l).bg }} />)}
              </span>
              {c.tags.slice(0, 2).map((t) => (
                <span key={t} title={t} className="truncate rounded px-1 py-px text-[10.5px] font-bold text-kth-navy" style={{ background: t.endsWith("börjar") ? "#def0ff" : "#e8f5ee" }}>
                  {t}
                </span>
              ))}
              {c.tags.length > 2 && <span className="text-[10.5px] font-bold text-[#5a6270]" title={c.tags.slice(2).join("\n")}>+{c.tags.length - 2}</span>}
            </div>
          ) : (
            <div key={i} className="min-h-[74px] rounded-lg border border-dashed border-[#e0e4e9]" />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-[12px] text-[#5a6270]">
        {[...used].map((l) => (
          <span key={l} className="flex items-center gap-[5px]">
            <span className="h-1.5 w-[18px] rounded-[3px]" style={{ background: color(l).bg }} />
            {l}
          </span>
        ))}
        <span>Utan färg: {schedule.off ? "svart skärm" : "standardlistan"}.</span>
      </div>
    </div>
  );
}

/** Everything with dates that touches the month, as bars: pages, list periods and schedule times with dates */
function Timeline({
  schedule,
  std,
  first,
  last,
  days,
  today,
  month,
  color,
  nameOf,
  onOpenList,
}: {
  schedule: Schedule;
  std: SignPage[];
  first: string;
  last: string;
  days: number;
  today: string;
  month: string;
  color: (n: string) => { bg: string; fg: string };
  nameOf: (p: SignPage) => string;
  onOpenList: (name: string) => void;
}) {
  type Bar = { name: string; where: string; start?: string; end?: string; list?: string; bg: string; fg: string };
  const page = (p: SignPage, i: number, list?: string): Bar => ({
    name: nameOf(p),
    where: list ? `Spellista ${list}, sida ${i + 1}` : `Standardlistan, sida ${i + 1}`,
    start: p.start,
    end: p.end,
    list,
    ...(list ? color(list) : { bg: "#5a6270", fg: "#ffffff" }),
  });
  const bars: Bar[] = [
    ...Object.entries(schedule.periods).map(([n, [a, b]]) => ({ name: n, where: "Hela spellistan", start: a, end: b, list: n, ...color(n) })),
    ...schedule.slots.flatMap((s, i) => (s.dates && !slotProblem(s, schedule.lists) ? [{ name: s.list, where: `Schemat, tid ${i + 1}`, start: s.dates[0], end: s.dates[1], list: s.list, ...color(s.list) }] : [])),
    ...std.flatMap((p, i) => (p.start || p.end ? [page(p, i)] : [])),
    ...Object.entries(schedule.lists).flatMap(([n, pages]) => pages.flatMap((p, i) => (p.start || p.end ? [page(p, i, n)] : []))),
  ].filter((b) => (!b.start || b.start <= last) && (!b.end || b.end >= first));
  const pos = (date: string) => ((Number(date.slice(8)) - 1) / days) * 100;
  const todayIn = today >= first && today <= last;
  return (
    <div className="flex flex-col gap-2.5 border-t border-[#e6e9ed] pt-3">
      <div>
        <h5 className="text-[14px] font-extrabold">Med datum i {month}</h5>
        <p className="mt-[3px] text-[13px] text-[#5a6270]">
          {bars.length ? "Sidor, spellistor och tider i schemat som bara gäller vissa datum. Klicka på en stapel för att öppna spellistan." : `Inget med datum berör ${month}.`}
        </p>
      </div>
      {bars.length > 0 && (
        <div className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
          <span />
          <div className="relative h-[18px] font-mono text-[10.5px] text-[#6b7380]">
            {[1, 5, 10, 15, 20, 25, days].map((d) => (
              <span key={d} className="absolute -translate-x-1/2" style={{ left: `${((d - 0.5) / days) * 100}%` }}>{d}</span>
            ))}
          </div>
          {bars.map((b, i) => {
            const from = b.start && b.start > first ? b.start : first;
            const to = b.end && b.end < last ? b.end : last;
            const left = pos(from), width = pos(to) - left + 100 / days;
            const label = rangeText(b.start, b.end);
            return (
              <div key={i} className="contents">
                <span className="min-w-0 text-[13px] leading-tight">
                  <b className="block truncate" title={b.name}>{b.name}</b>
                  <span className="text-[12px] text-[#5a6270]">{b.where}</span>
                </span>
                <div className="relative h-[30px] rounded-md bg-[#f4f5f7]" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(100% / ${days} - 1px), #e6e9ed calc(100% / ${days} - 1px) calc(100% / ${days}))` }}>
                  <button
                    type="button"
                    disabled={!b.list}
                    onClick={() => b.list && onOpenList(b.list)}
                    title={`${b.name}: ${label}`}
                    className="absolute inset-y-[3px] flex items-center overflow-hidden whitespace-nowrap rounded-[5px] px-2 text-[11.5px] font-bold disabled:cursor-default"
                    style={{ left: `${left}%`, width: `${width}%`, background: b.bg, color: b.fg }}
                  >
                    {label}
                  </button>
                  {todayIn && <div className="pointer-events-none absolute -inset-y-1 w-0.5 bg-[#a1271d]" style={{ left: `${pos(today) + 50 / days}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {todayIn && bars.length > 0 && <span className="text-[12px] font-semibold text-[#a1271d]">Röd linje: i dag, {shortDate(today)}</span>}
    </div>
  );
}
