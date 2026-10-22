/**
 * Skylt (COMPUTER_TYPE=signage on Linux, HOME_MODE=signage on Android): the pages a sign shows
 * and when. Shared by the settings form (client) and the server; no server-only imports.
 *
 *   SIGN_PAGES     the standard list: [{"url","s"}], shown when nothing in the schedule applies
 *   SIGN_SCHEDULE  {"lists": {name: [page…]}, "slots": [{list, days?, from?, to?, dates?}], "periods"?: {name: [first, last]}, "off"?}
 *
 * A page can have "start"/"end" (YYYY-MM-DD, inclusive) and is skipped outside them; a list can have
 * a period and is not used outside it (handoffs 16 okt). Older kiosks ignore both and always show.
 *
 * The kiosks pick the list with the same rules as activeList() below (handoffs 14 okt).
 */

export const SIGN_PAGES_KEY = "SIGN_PAGES";
export const SIGN_SCHEDULE_KEY = "SIGN_SCHEDULE";
export const SIGN_SECONDS_KEY = "SIGN_SECONDS";
/** Minutes between soft reloads of a list with a single page (0: never); kiosks 2026-10 */
export const SIGN_RELOAD_KEY = "SIGN_RELOAD";
export const SIGN_JS_KEY = "SIGN_JS";
/** all (default): the pages' scripts, fonts, images and requests from any https address; allowed: only WHITE_LIST */
export const SIGN_RESOURCES_KEY = "SIGN_RESOURCES";
export const SIGN_KEYS = [SIGN_SCHEDULE_KEY, SIGN_PAGES_KEY, SIGN_SECONDS_KEY, SIGN_RELOAD_KEY, SIGN_JS_KEY, SIGN_RESOURCES_KEY];

/**
 * s: seconds for this page, null = SIGN_SECONDS. media: the file in the media library (admin only).
 * start/end: the first and last day the page is shown (inclusive), missing = no limit.
 */
export type SignPage = { url: string; s: number | null; media?: string; start?: string; end?: string };
export const SIGN_SECONDS_MIN = 5;
export const SIGN_SECONDS_MAX = 3600;
/** PubLiKiosk shows at most this many pages per list (its catalog) */
const MAX_PAGES_ANDROID = 36;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Start/end of a page or a list (both optional, inclusive), or why they can't be used */
function datesProblem(start: string | undefined, end: string | undefined): string | null {
  if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return "ogiltigt datum";
  if (start && end && start > end) return "sista dagen måste vara samma dag eller efter den första";
  return null;
}

/** Whether a page is shown on a date (YYYY-MM-DD in Stockholm) */
export const pageOn = (p: { start?: string; end?: string }, date: string) => (!p.start || date >= p.start) && (!p.end || date <= p.end);

/** always: no dates; coming: starts later; active: has dates and is shown today; expired: ended */
export type DateState = "always" | "coming" | "active" | "expired";
export function dateState(start: string | undefined, end: string | undefined, today: string): DateState {
  if (!start && !end) return "always";
  if (start && today < start) return "coming";
  if (end && today > end) return "expired";
  return "active";
}

// --- pages ---

function toPage(p: unknown): SignPage {
  const o = (p && typeof p === "object" ? p : {}) as { url?: unknown; s?: unknown; media?: unknown; start?: unknown; end?: unknown };
  return {
    url: typeof o.url === "string" ? o.url : "",
    s: typeof o.s === "number" ? o.s : null,
    ...(typeof o.media === "string" ? { media: o.media } : {}),
    ...(typeof o.start === "string" && o.start ? { start: o.start } : {}),
    ...(typeof o.end === "string" && o.end ? { end: o.end } : {}),
  };
}

/** The kiosk reads a JSON list [{"url","s"}] or one page per line "adress|sekunder"; the editor writes JSON */
export function parseSignPages(value: string | null): SignPage[] {
  const v = (value ?? "").trim();
  if (!v) return [];
  if (v.startsWith("[")) {
    try {
      const list: unknown = JSON.parse(v);
      if (Array.isArray(list)) return list.map(toPage);
    } catch {
      /* not JSON: as lines below */
    }
  }
  return v
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, sec] = line.split("|").map((x) => x.trim());
      return { url, s: sec && /^\d+$/.test(sec) ? Number(sec) : null };
    });
}

const pageJson = (p: SignPage) => ({
  url: p.url,
  ...(p.s === null ? {} : { s: p.s }),
  ...(p.media ? { media: p.media } : {}),
  ...(p.start ? { start: p.start } : {}),
  ...(p.end ? { end: p.end } : {}),
});

export function serializeSignPages(pages: SignPage[]): string {
  const kept = pages.filter((p) => p.url.trim());
  return kept.length ? JSON.stringify(kept.map(pageJson)) : "";
}

function pagesProblem(pages: SignPage[], platform: string | undefined, where: string): string | null {
  if (platform === "android" && pages.length > MAX_PAGES_ANDROID) return `${where}: högst ${MAX_PAGES_ANDROID} sidor.`;
  for (const [i, p] of pages.entries()) {
    // https (kiosken kräver det); http://localhost bara för lokal utveckling av admin
    if (!/^https:\/\/[^\s/]+|^http:\/\/localhost(:\d+)?\//.test(p.url)) return `${where}, sida ${i + 1}: adressen måste börja med https://.`;
    if (p.s !== null && (!Number.isInteger(p.s) || p.s < SIGN_SECONDS_MIN || p.s > SIGN_SECONDS_MAX))
      return `${where}, sida ${i + 1}: sekunderna måste vara ${SIGN_SECONDS_MIN}–${SIGN_SECONDS_MAX}.`;
    const d = datesProblem(p.start, p.end);
    if (d) return `${where}, sida ${i + 1}: ${d}.`;
  }
  return null;
}

export function signPagesProblem(value: string, platform?: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("[")) {
    try {
      if (!Array.isArray(JSON.parse(v))) return "Måste vara en lista.";
    } catch {
      return "Listan är inte giltig JSON.";
    }
  }
  return pagesProblem(parseSignPages(v), platform, "Standardlistan");
}

// --- schedule ---

/** days 1–7 = mån–sön; from/to "HH:MM" (to not included, "24:00" = midnight); dates [first, last] inclusive */
export type Slot = { list: string; days?: number[]; from?: string; to?: string; dates?: [string, string] };
/** periods: the days a list is used, [first, last] inclusive; a list without one is always used */
export type Schedule = { lists: Record<string, SignPage[]>; slots: Slot[]; periods: Record<string, [string, string]>; off: boolean };
export const EMPTY_SCHEDULE: Schedule = { lists: {}, slots: [], periods: {}, off: false };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function parseSchedule(value: string | null): Schedule {
  try {
    const o: unknown = JSON.parse(value ?? "");
    if (!o || typeof o !== "object" || Array.isArray(o)) return { ...EMPTY_SCHEDULE };
    const raw = o as { lists?: unknown; slots?: unknown; periods?: unknown; off?: unknown };
    const lists: Record<string, SignPage[]> = {};
    if (raw.lists && typeof raw.lists === "object" && !Array.isArray(raw.lists))
      for (const [name, pages] of Object.entries(raw.lists)) lists[name] = Array.isArray(pages) ? pages.map(toPage) : [];
    const slots: Slot[] = Array.isArray(raw.slots)
      ? raw.slots.map((s) => {
          const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
          return {
            list: typeof r.list === "string" ? r.list : "",
            ...(Array.isArray(r.days) ? { days: r.days.filter((d): d is number => typeof d === "number") } : {}),
            ...(typeof r.from === "string" ? { from: r.from } : {}),
            ...(typeof r.to === "string" ? { to: r.to } : {}),
            ...(Array.isArray(r.dates) && r.dates.length === 2 ? { dates: [String(r.dates[0]), String(r.dates[1])] as [string, string] } : {}),
          };
        })
      : [];
    const periods: Record<string, [string, string]> = {};
    if (raw.periods && typeof raw.periods === "object" && !Array.isArray(raw.periods))
      for (const [name, p] of Object.entries(raw.periods)) if (Array.isArray(p) && p.length === 2) periods[name] = [String(p[0]), String(p[1])];
    return { lists, slots, periods, off: raw.off === true };
  } catch {
    return { ...EMPTY_SCHEDULE };
  }
}

export function serializeSchedule(s: Schedule): string {
  if (!Object.keys(s.lists).length && !s.slots.length && !s.off) return "";
  const periods = Object.entries(s.periods).filter(([n]) => n in s.lists);
  return JSON.stringify({
    lists: Object.fromEntries(Object.entries(s.lists).map(([n, pages]) => [n, pages.filter((p) => p.url.trim()).map(pageJson)])),
    slots: s.slots,
    ...(periods.length ? { periods: Object.fromEntries(periods) } : {}),
    ...(s.off ? { off: true } : {}),
  });
}

/** Why a slot can't be used (the kiosks skip it), or null */
export function slotProblem(slot: Slot, lists: Record<string, SignPage[]>): string | null {
  if (!(slot.list in lists)) return slot.list ? `spellistan ${slot.list} finns inte` : "ingen spellista vald";
  if (slot.days && (!slot.days.length || slot.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7))) return "välj minst en veckodag";
  if (slot.from !== undefined && !TIME.test(slot.from)) return "ogiltig starttid";
  if (slot.to !== undefined && !TIME.test(slot.to)) return "ogiltig sluttid";
  if (slot.from && slot.to && minutes(slot.from) >= minutes(slot.to)) return "sluttiden måste vara efter starttiden";
  if (slot.dates && (!DATE.test(slot.dates[0]) || !DATE.test(slot.dates[1]))) return "ogiltigt datum";
  if (slot.dates && slot.dates[0] > slot.dates[1]) return "sista datum måste vara samma dag eller efter det första";
  return null;
}

export function scheduleProblem(value: string, platform?: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const o: unknown = JSON.parse(v);
    if (!o || typeof o !== "object" || Array.isArray(o)) return "Schemat måste vara ett JSON-objekt.";
  } catch {
    return "Schemat är inte giltig JSON.";
  }
  const s = parseSchedule(v);
  for (const [name, pages] of Object.entries(s.lists)) {
    if (!name.trim()) return "En spellista saknar namn.";
    const p = pagesProblem(pages, platform, `Spellistan ${name}`);
    if (p) return p;
  }
  for (const [name, [first, last]] of Object.entries(s.periods)) {
    if (!(name in s.lists)) return `Perioden för ${name}: spellistan finns inte.`;
    const p = datesProblem(first, last);
    if (p) return `Spellistan ${name}, Gäller: ${p}.`;
  }
  for (const [i, slot] of s.slots.entries()) {
    const p = slotProblem(slot, s.lists);
    if (p) return `Tid ${i + 1}: ${p}.`;
  }
  return null;
}

/** Whether a list is used on a date: it has no period, or the date is within it */
export function listOn(s: Schedule, name: string, date: string): boolean {
  const p = s.periods[name];
  return !p || (date >= p[0] && date <= p[1]);
}

// Ett format för alla anrop: att skapa ett Intl.DateTimeFormat är dyrt
let stockholmFormat: Intl.DateTimeFormat | null = null;

/** Day (1–7, mån–sön), minutes since midnight and ISO date in Stockholm */
export function stockholmNow(now: Date): { day: number; min: number; date: string } {
  stockholmFormat ??= new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(stockholmFormat.formatToParts(now).map((p) => [p.type, p.value]));
  const day = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"].findIndex((d) => parts.weekday.toLowerCase().startsWith(d.slice(0, 3))) + 1;
  return { day, min: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

export function slotApplies(slot: Slot, at: { day: number; min: number; date: string }): boolean {
  if (slot.days && !slot.days.includes(at.day)) return false;
  if (slot.from && at.min < minutes(slot.from)) return false;
  if (slot.to && at.min >= minutes(slot.to)) return false;
  if (slot.dates && (at.date < slot.dates[0] || at.date > slot.dates[1])) return false;
  return true;
}

/**
 * What the sign shows now, with the kiosks' rules: slots that can't be used are skipped; among
 * those that apply the first with dates wins, else the first without. None (or an empty list):
 * the standard list, or a dark screen with off.
 */
export type Active = { kind: "list"; name: string; slot: number } | { kind: "standard" } | { kind: "off" };

export function activeList(s: Schedule, now: Date): Active {
  return activeAt(s, stockholmNow(now));
}

/**
 * activeList at a day, minute and date in Stockholm. Dates: a slot whose list is outside its period
 * is skipped like an unknown list; a list with no page shown on the date counts as empty.
 */
export function activeAt(s: Schedule, at: { day: number; min: number; date: string }): Active {
  const ok = s.slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => !slotProblem(slot, s.lists) && listOn(s, slot.list, at.date) && slotApplies(slot, at));
  const hit = ok.find(({ slot }) => slot.dates) ?? ok[0];
  if (hit && s.lists[hit.slot.list].some((p) => p.url.trim() && pageOn(p, at.date))) return { kind: "list", name: hit.slot.list, slot: hit.i };
  return s.off ? { kind: "off" } : { kind: "standard" };
}

/** Weekly slots (without dates) that overlap: the later one never shows in that time */
export function slotOverlaps(s: Schedule): [number, number][] {
  const weekly = s.slots.map((slot, i) => ({ slot, i })).filter(({ slot }) => !slot.dates && !slotProblem(slot, s.lists));
  const out: [number, number][] = [];
  for (let a = 0; a < weekly.length; a++)
    for (let b = a + 1; b < weekly.length; b++) {
      const x = weekly[a].slot, y = weekly[b].slot;
      const days = (x.days ?? [1, 2, 3, 4, 5, 6, 7]).some((d) => (y.days ?? [1, 2, 3, 4, 5, 6, 7]).includes(d));
      const xf = x.from ? minutes(x.from) : 0, xt = x.to ? minutes(x.to) : 1440, yf = y.from ? minutes(y.from) : 0, yt = y.to ? minutes(y.to) : 1440;
      if (days && xf < yt && yf < xt) out.push([weekly[a].i, weekly[b].i]);
    }
  return out;
}

const activeKey = (a: Active) => (a.kind === "list" ? `list:${a.name}` : a.kind);

/**
 * When what the sign shows changes next (within about a week), and to what; null if never. Only
 * the minutes where something can change are checked: midnight (dates) and each usable slot's from/to.
 */
export function nextChange(s: Schedule, now: Date): { at: Date; to: Active } | null {
  if (!s.slots.some((slot) => !slotProblem(slot, s.lists))) return null;
  const bounds = dayBounds(s);
  const start = Math.floor(now.getTime() / 60_000) * 60_000;
  const current = activeKey(activeList(s, new Date(start)));
  const startMin = stockholmNow(new Date(start)).min;
  // Minuter framåt till varje gräns, dag för dag (sommartid kan flytta en gräns en timme, men
  // varje kandidat räknas om med activeList vid sin verkliga tidpunkt)
  for (let day = 0; day <= 8; day++)
    for (const b of bounds) {
      const ahead = day * 1440 + b - startMin;
      if (ahead <= 0) continue;
      const at = new Date(start + ahead * 60_000);
      const a = activeList(s, at);
      if (activeKey(a) !== current) return { at, to: a };
    }
  return null;
}

/** Minutes in a day where what the sign shows can change: midnight and each usable slot's from/to */
export function dayBounds(s: Schedule): number[] {
  const usable = s.slots.filter((slot) => !slotProblem(slot, s.lists));
  return [...new Set([0, ...usable.flatMap((slot) => [slot.from, slot.to].filter((t): t is string => !!t).map((t) => minutes(t) % 1440))])].sort((a, b) => a - b);
}

/** Day of the week (1–7, mån–sön) of a date YYYY-MM-DD */
export const weekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** A date YYYY-MM-DD plus n days */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
