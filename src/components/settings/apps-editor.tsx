"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  APP_ICONS,
  appProblems,
  EMPTY_APP,
  hostAllowed,
  hostOf,
  infoFieldProblem,
  MAX_APPS_LAUNCHER,
  MAX_APPS_TABS,
  parseApps,
  parseInfoField,
  serializeApps,
  serializeInfoField,
  type AppEntry,
  type CatalogEntry,
  type InfoField,
} from "@/lib/settings-shared";
import { AppIcon } from "@/components/ui/app-icons";
// KTH:s vita logotyp (samma fil som i static och bookingtools), som statisk tillgång så att sökvägen
// får BASE_PATH även här i webbläsaren
import kthLogoWhite from "@/components/ui/kth-logo-white.svg";
import { FieldControl } from "./field-control";

/** One setting as the editor shows it (the same as a row in the settings form gets) */
export type EditorField = {
  meta: CatalogEntry;
  /** Own, drafted or inherited; null when nothing is set anywhere */
  value: string | null;
  inherited: boolean;
  problem?: string;
  onChange: (value: string) => void;
  onClear: () => void;
};

type Row = AppEntry & { id: number; adv: boolean };

const INPUT = "h-[38px] w-full rounded-lg border bg-white px-3 text-sm";
const LABEL = "text-[13px] font-bold";
const GAP = 12;

let nextId = 1;
const toRows = (value: string | null): Row[] =>
  parseApps(value).map((a) => ({ ...a, id: nextId++, adv: !!a.scope }));
const toValue = (rows: Row[], json = false) => serializeApps(rows, json);

/** A text setting that updates the preview as you type; emptied = not set here (the tablet's default text) */
function LiveText({ field, label, placeholder }: { field: EditorField; label: string; placeholder?: string }) {
  const id = `f-${field.meta.key}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input
        id={id}
        value={field.value ?? ""}
        onChange={(e) => (e.target.value === "" ? field.onClear() : field.onChange(e.target.value))}
        placeholder={placeholder ?? field.meta.example ?? undefined}
        aria-invalid={!!field.problem || undefined}
        className={`${INPUT} ${field.problem ? "border-bad-ink" : field.inherited ? "border-dashed border-field bg-[#f8f9fa] text-muted" : "border-field"}`}
      />
      {field.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{field.problem}</p>}
    </div>
  );
}

const INFO_TYPES = [
  { value: "text", label: "Text" },
  { value: "url", label: "Text från adress" },
  { value: "clock", label: "Klocka" },
];

/** One information field (LAUNCHER_FIELD_n): label, what it shows, the value, and the label in English */
/** Under an address field: https required, and a warning when the device won't fetch from its host */
function UrlNote({ field, hostWarning }: { field: EditorField; hostWarning: (url: string) => string | null }) {
  const url = field.value?.trim() ?? "";
  if (!url) return null;
  if (field.problem) return <p className="text-[12.5px] font-semibold text-bad-ink">{field.problem}</p>;
  const warn = !/^https:\/\/[^\s/]+/.test(url) ? "Adressen måste börja med https://" : hostWarning(url);
  return warn ? <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-warn-ink">{warn}</p> : null;
}

/** An on/off setting with its label beside the switch */
function SwitchField({ field, label }: { field: EditorField; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`f-${field.meta.key}`} className={LABEL}>{label}</label>
      <div className="flex h-[38px] items-center">
        <FieldControl {...field} invalid={!!field.problem} />
      </div>
      {field.meta.help && <p className="text-[12px] leading-snug text-muted">{field.meta.help}</p>}
    </div>
  );
}

function InfoFieldRow({ field, n, hostWarning }: { field: EditorField; n: number; hostWarning: (url: string) => string | null }) {
  // Det som skrivs hålls här (med mellanslag och allt) och sparas trimmat; annars försvann ett
  // mellanslag i slutet direkt, och det gick inte att skriva två ord
  const external = field.value ?? "";
  const [f, setF] = useState<InfoField>(() => parseInfoField(field.value));
  const [synced, setSynced] = useState(external);
  if (external !== synced) {
    setSynced(external);
    if (serializeInfoField(f) !== external) setF(parseInfoField(field.value));
  }
  const set = (p: Partial<InfoField>) => {
    const next = { ...f, ...p };
    setF(next);
    const v = serializeInfoField(next);
    setSynced(v);
    if (v) field.onChange(v);
    else field.onClear();
  };
  const problem = infoFieldProblem(f);
  const warn = f.type === "url" && !problem ? hostWarning(f.value) : null;
  const id = `f-${field.meta.key}`;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line p-3">
      <div className="grid gap-3 @2xl:grid-cols-[1fr_1fr_2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-label`} className={LABEL}>Fält {n}: etikett</label>
          <input id={`${id}-label`} value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="t.ex. Öppet idag" className={`${INPUT} border-field`} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-type`} className={LABEL}>Visar</label>
          <select id={`${id}-type`} value={f.type} onChange={(e) => set({ type: e.target.value })} className={`${INPUT} border-field px-2.5`}>
            <option value="">Inget (fältet visas inte)</option>
            {INFO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-value`} className={LABEL}>{f.type === "url" ? "Adress (svarar med ren text)" : "Text"}</label>
          <input
            id={`${id}-value`}
            value={f.type === "clock" ? "" : f.value}
            disabled={f.type === "clock" || !f.type}
            inputMode={f.type === "url" ? "url" : undefined}
            onChange={(e) => set({ value: e.target.value })}
            placeholder={f.type === "clock" ? "Klockan visas" : f.type === "url" ? "https://" : "t.ex. 8–19"}
            className={`${INPUT} ${f.type === "url" ? "font-mono text-[13px]" : ""} ${problem ? "border-bad-ink" : "border-field"} disabled:bg-page`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-en`} className={LABEL}>Etikett (English)</label>
          <input id={`${id}-en`} value={f.labelEn} onChange={(e) => set({ labelEn: e.target.value })} placeholder="Tomt: den svenska" className={`${INPUT} border-field`} />
        </div>
      </div>
      {problem && <p className="text-[12.5px] font-semibold text-bad-ink">{problem} Enheten visar inte fältet.</p>}
      {warn && <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-warn-ink">{warn}</p>}
    </div>
  );
}

/** "Börja med": one of the two big choice cards */
function ModeCard({ selected, title, text, picture, onPick }: { selected: boolean; title: string; text: string; picture: React.ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 text-left ${selected ? "border-kth-blue bg-[#f4f8fd]" : "border-line bg-white hover:border-field"}`}
    >
      <span className="flex h-16 w-[92px] shrink-0 rounded-lg border border-field p-1.5" aria-hidden="true">{picture}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[16px] font-extrabold text-kth-navy">{title}</span>
        <span className="text-[13px] leading-snug text-muted">{text}</span>
      </span>
    </button>
  );
}

function IconSelect({
  id,
  value,
  inherited,
  allowNone,
  onChange,
}: {
  id: string;
  value: string;
  inherited?: boolean;
  allowNone?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`flex h-[38px] items-center gap-2 rounded-lg border px-2.5 ${inherited ? "border-dashed border-field bg-[#f8f9fa] text-muted" : "border-field bg-white"}`}
    >
      <AppIcon name={value} className="text-select-ink" />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none">
        {allowNone && <option value="">Ingen ikon</option>}
        {value && !APP_ICONS.some((i) => i.value === value) && <option value={value}>{value}</option>}
        {APP_ICONS.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The Android tablets' start and web apps. "Börja med" (HOME_MODE): a first page with services
 * (launcher: LAUNCHER_TITLE/SUBTITLE/FOOTER and up to six services) or one app as home (app:
 * START_URL, START_LABEL, START_ICON and up to five more). The list is APPS in both modes, one per
 * line "Namn|https://adress/|ikon|område|beskrivning". Rows are reordered by
 * dragging the handle: pointer events with capture, so the row itself follows the pointer
 * (no browser drag image) and the others move aside as its edge passes their middle.
 */
export function AppsEditor({
  apps,
  homeUrl,
  appScope,
  homeLabel,
  homeIcon,
  homeMode,
  launcherTitle,
  launcherSubtitle,
  launcherFooter,
  launcherTitleEn,
  launcherSubtitleEn,
  launcherFooterEn,
  alwaysJson = false,
  infoFields = [],
  message,
  messageEn,
  messageUrl,
  messageStyle,
  messageIcon,
  refresh,
  perPage,
  footerPage = {},
  attract = {},
  allowedSites,
}: {
  apps: EditorField;
  /**
   * START_URL/APP_SCOPE (Android, older settings): the home app before the first service was home.
   * Only shown as "Flytta in som första tjänst"; PubLiKiosk 3.20 still reads them when APPS lacks the address.
   */
  homeUrl?: EditorField;
  appScope?: EditorField;
  homeLabel?: EditorField;
  homeIcon?: EditorField;
  /** Missing in an older catalog: then always one app as home */
  homeMode?: EditorField;
  launcherTitle?: EditorField;
  launcherSubtitle?: EditorField;
  launcherFooter?: EditorField;
  /** The first page's texts in English (empty: the Swedish text) */
  launcherTitleEn?: EditorField;
  launcherSubtitleEn?: EditorField;
  launcherFooterEn?: EditorField;
  /** Linux: APPS is always written as one line of JSON (each setting is one line in .config) */
  alwaysJson?: boolean;
  /** LAUNCHER_FIELD_1–4: the first page's information fields (missing in older catalogs) */
  infoFields?: (EditorField | undefined)[];
  /** LAUNCHER_MESSAGE(_EN, _URL, _STYLE): the message line above the fields */
  message?: EditorField;
  messageEn?: EditorField;
  messageUrl?: EditorField;
  messageStyle?: EditorField;
  /** LAUNCHER_MESSAGE_ICON: the icon before the message ("none" = no icon; missing key = info) */
  messageIcon?: EditorField;
  /** LAUNCHER_REFRESH: minutes between fetches from the addresses */
  refresh?: EditorField;
  /** LAUNCHER_PER_PAGE (Linux-kiosken): services per page on the first page, more become pages */
  perPage?: EditorField;
  /** LAUNCHER_HTML_URL, _HEIGHT, _JS, _TOUCH: a whole web page in the bottom row instead of the fields */
  footerPage?: { url?: EditorField; height?: EditorField; js?: EditorField; touch?: EditorField };
  /** ATTRACT_URL, _AFTER, _REFRESH, _JS: a full-screen page while the first page is untouched */
  attract?: { url?: EditorField; after?: EditorField; refresh?: EditorField; js?: EditorField };
  /**
   * The setting with the allowed sites ({label, key, value}): an address in a field or the message
   * is fetched only if its host is a service, the start page or one of these
   */
  allowedSites?: { label: string; key: string; value: string | null };
}) {
  const launcher = (homeMode?.value ?? homeMode?.meta.defaultValue ?? "app") === "launcher";
  // Första tjänsten är hem på båda plattformarna (PubLiKiosk 3.20, Linux-kiosken); START_LABEL/START_ICON
  // är startknappen som tar besökaren tillbaka till början. 36 på förstasidan (flera sidor), sex som flikar.
  const max = launcher ? MAX_APPS_LAUNCHER : MAX_APPS_TABS;
  // Utan LAUNCHER_PER_PAGE (äldre katalog) visar förstasidan alla på en sida
  const pageSize = perPage ? Number(perPage.value ?? perPage.meta.defaultValue ?? 4) || 4 : MAX_APPS_LAUNCHER;
  const external = apps.value ?? "";
  const [rows, setRows] = useState<Row[]>(() => toRows(apps.value));
  // Ångra, Ångra alla or a save outside the editor: show the value it now has
  const [synced, setSynced] = useState(external);
  if (external !== synced) {
    setSynced(external);
    if (toValue(rows, alwaysJson) !== external) setRows(toRows(apps.value));
  }

  // Äldre Android-inställning: startsidan i START_URL som PubLiKiosk lägger först om adressen saknas i APPS
  const legacyUrl = homeUrl?.value?.trim() ?? "";
  const legacyHome =
    legacyUrl && !rows.some((r) => r.url.trim() === legacyUrl || r.urlEn.trim() === legacyUrl)
      ? {
          ...EMPTY_APP,
          name: homeLabel?.value?.trim() || "Hem",
          nameEn: homeLabel?.value?.trim() ? "" : "Home",
          icon: homeIcon?.value ?? homeIcon?.meta.defaultValue ?? "house",
          scope: appScope?.value?.trim() ?? "",
          url: legacyUrl,
        }
      : null;
  const homeTabs = [
    ...(legacyHome ? [{ id: -2, sv: legacyHome.name, en: legacyHome.nameEn, icon: legacyHome.icon, home: true }] : []),
    ...rows.map((r, i) => ({ id: r.id, sv: r.name.trim() || "Utan namn", en: r.nameEn.trim(), icon: r.icon, home: !legacyHome && i === 0 })),
  ];
  /** Startsidan in som första tjänst, och START_URL/APP_SCOPE bort på den här nivån (ärvda värden ligger kvar men dubblas inte) */
  const moveLegacyHome = () => {
    if (!legacyHome) return;
    commit([{ ...legacyHome, id: nextId++, adv: !!legacyHome.scope }, ...rows]);
    if (homeUrl && !homeUrl.inherited) homeUrl.onClear();
    if (appScope && appScope.value !== null && !appScope.inherited) appScope.onClear();
  };

  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; hs: number[]; startY: number; startTop: number; cur: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; ty: number } | null>(null);

  const commit = (next: Row[]) => {
    setRows(next);
    const value = toValue(next, alwaysJson);
    setSynced(value);
    apps.onChange(value);
  };
  const patch = (id: number, p: Partial<Row>) => commit(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  // --- dragging ---
  const topOf = (hs: number[], k: number) => hs.slice(0, k).reduce((a, b) => a + b, 0) + GAP * k;
  const onDown = (e: React.PointerEvent<HTMLButtonElement>, id: number) => {
    if (e.button !== 0 || !listRef.current) return;
    const cards = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-app-card]"));
    const hs = cards.map((c) => c.getBoundingClientRect().height);
    const cur = rows.findIndex((r) => r.id === id);
    // pageY: raden följer pekaren även om sidan scrollar medan man drar
    dragRef.current = { id, hs, startY: e.pageY, startTop: topOf(hs, cur), cur };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    setDrag({ id, ty: 0 });
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const n = d.hs.length;
    const total = topOf(d.hs, n - 1) + d.hs[n - 1];
    // Klampa så att raden når första och sista platsen men inte längre
    const vTop = Math.max(0, Math.min(d.startTop + (e.pageY - d.startY), total - d.hs[d.cur]));
    const r = rows.slice();
    const start = d.cur;
    // Byt plats när den dragna radens kant passerar grannens mitt (underkanten nedåt, överkanten uppåt)
    while (d.cur < n - 1 && vTop + d.hs[d.cur] > topOf(d.hs, d.cur + 1) + d.hs[d.cur + 1] / 2) {
      const k = d.cur;
      [r[k], r[k + 1]] = [r[k + 1], r[k]];
      [d.hs[k], d.hs[k + 1]] = [d.hs[k + 1], d.hs[k]];
      d.cur = k + 1;
    }
    while (d.cur > 0 && vTop < topOf(d.hs, d.cur - 1) + d.hs[d.cur - 1] / 2) {
      const k = d.cur;
      [r[k], r[k - 1]] = [r[k - 1], r[k]];
      [d.hs[k], d.hs[k - 1]] = [d.hs[k - 1], d.hs[k]];
      d.cur = k - 1;
    }
    if (d.cur !== start) commit(r);
    setDrag({ id: d.id, ty: vTop - topOf(d.hs, d.cur) });
  };
  const onUp = () => {
    dragRef.current = null;
    setDrag(null);
  };
  // Släpp var som helst (även utanför handtaget eller fönstret) avslutar dragningen
  const anyDrag = drag !== null;
  useEffect(() => {
    if (!anyDrag) return;
    const end = () => onUp();
    window.addEventListener("pointerup", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("blur", end);
    };
  }, [anyDrag]);

  const pickMode = (mode: "app" | "launcher") => {
    if (!homeMode) return;
    // Standardläget (En app) sätts inte uttryckligen: det är vad enheten gör utan inställning
    if (mode === (homeMode.meta.defaultValue ?? "app") && !homeMode.inherited) homeMode.onClear();
    else homeMode.onChange(mode);
  };
  // Förhandsvisningen på svenska eller engelska, med appens fallback: tom engelsk text → den svenska →
  // standardtexten på engelska (LauncherScreen.pick)
  const [english, setEnglish] = useState(false);
  const text = (sv: EditorField | undefined, en: EditorField | undefined, svDefault: string, enDefault: string) => {
    const s = sv?.value?.trim() ?? "", e = en?.value?.trim() ?? "";
    return english ? e || s || enDefault : s || svDefault;
  };
  const title = text(launcherTitle, launcherTitleEn, "Vad vill du göra?", "What do you need?");
  const subtitle = text(launcherSubtitle, launcherSubtitleEn, "Tryck på en tjänst för att börja.", "Tap a service to begin.");
  const footer = text(launcherFooter, launcherFooterEn, "", "");

  // Informationsfält och meddelanderad
  const fields = infoFields.filter((f): f is EditorField => !!f);
  const shownFields = fields.map((f) => parseInfoField(f.value)).filter((f) => f.type && !infoFieldProblem(f));
  const pageUrl = footerPage.url?.value?.trim() ?? "";
  const pageHeight = Math.min(400, Math.max(40, Number(footerPage.height?.value ?? footerPage.height?.meta.defaultValue ?? 100) || 100));
  const messageText = text(message, messageEn, "", "") || (messageUrl?.value?.trim() ? (english ? "(text from the address)" : "(text från adressen)") : "");
  // info = blå (information), warning = gul (varning), alert = röd (störning)
  const messageLevel = messageStyle?.value ?? messageStyle?.meta.defaultValue ?? "warning";
  const messageColors =
    messageLevel === "alert"
      ? "bg-[#b3261e] text-white"
      : messageLevel === "info"
        ? "border-t-2 border-kth-blue bg-kth-light-blue text-kth-navy"
        : "border-t-2 border-[#e0a82e] bg-[#fff3d6] text-[#4a3200]";
  const messageIconName = messageIcon ? (messageIcon.value ?? messageIcon.meta.defaultValue ?? "info") : "info";
  const allowed = [
    ...(allowedSites?.value ?? "").split(/[\s,]+/).filter(Boolean),
    // Enheten tillåter själv tjänsternas värdar, också den engelska adressens
    ...rows.flatMap((r) => [r.url, r.urlEn]).filter(Boolean),
    ...(homeUrl?.value ? [homeUrl.value] : []),
  ];
  const hostWarning = (url: string) => {
    const host = hostOf(url);
    if (!host || hostAllowed(host, allowed)) return null;
    return `${host} är inte en tillåten webbplats, så enheten hämtar inget därifrån. Lägg till den i ${allowedSites?.label ?? "Tillåtna webbplatser"} (${allowedSites?.key ?? "WHITE_LIST"}) eller som tjänst.`;
  };
  const clockNow = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const homeName = homeLabel?.value?.trim() || "Hem";
  const homeIconName = homeIcon?.value ?? homeIcon?.meta.defaultValue ?? "house";

  return (
    // @container: rutnäten följer redigerarens och kortens bredd, inte fönstrets (med sidomenyn
    // och inställningsgrupperna bredvid blev korten trånga i ett halvbrett fönster)
    <div className="@container flex flex-col gap-4">
      {/* Börja med */}
      {homeMode && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <h4 className="text-[15px] font-extrabold">Börja med</h4>
          <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
            <ModeCard
              selected={launcher}
              title="Förstasida med tjänster"
              text="Besökaren väljer bland stora kort. Alla tjänster är jämställda."
              onPick={() => pickMode("launcher")}
              picture={
                <span className="grid flex-1 grid-cols-2 grid-rows-2 gap-1">
                  {[0, 1, 2, 3].map((i) => <span key={i} className="rounded-[3px] bg-kth-light-blue" />)}
                </span>
              }
            />
            <ModeCard
              selected={!launcher}
              title="Första tjänsten är hem"
              text="Första tjänsten öppnas direkt. De övriga ligger som flikar i navigeringen."
              onPick={() => pickMode("app")}
              picture={
                <span className="flex flex-1 flex-col justify-between">
                  <span className="h-1.5 w-3/5 rounded-[3px] bg-line" />
                  <span className="h-1.5 w-4/5 rounded-[3px] bg-line-soft" />
                  <span className="h-2.5 rounded-[3px] bg-kth-blue" />
                </span>
              }
            />
          </div>
          <p className="mt-3 text-[13px] leading-snug text-muted">
            {launcher
              ? "Efter inaktivitet går enheten tillbaka till förstasidan med ny session. Har den bara en tjänst går den direkt in i den."
              : "Efter inaktivitet går enheten tillbaka till första tjänsten med ny session."}
          </p>
          {homeMode.problem && <p className="mt-1.5 text-[12.5px] font-semibold text-bad-ink">{homeMode.problem}</p>}
        </section>
      )}

      {/* Förstasidans texter */}
      {launcher && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Förstasidan</h4>
            <p className="text-[13px] text-muted">
              Texterna på sidan där besökaren väljer tjänst, på svenska och engelska. Tomt ger standardtexten; tom engelska ger den svenska.
            </p>
          </div>
          <div className="mt-3 grid gap-4 @xl:grid-cols-2">
            {launcherTitle && <LiveText field={launcherTitle} label="Rubrik" />}
            {launcherTitleEn && <LiveText field={launcherTitleEn} label="Rubrik (English)" placeholder="Tomt: den svenska rubriken" />}
            {launcherSubtitle && <LiveText field={launcherSubtitle} label="Underrubrik" />}
            {launcherSubtitleEn && <LiveText field={launcherSubtitleEn} label="Underrubrik (English)" placeholder="Tomt: den svenska underrubriken" />}
            {launcherFooter && (
              <LiveText field={launcherFooter} label="Text längst ner (valfri)" placeholder="Lämna tom om du inte vill ha någon text" />
            )}
            {launcherFooterEn && <LiveText field={launcherFooterEn} label="Text längst ner (English)" placeholder="Tomt: den svenska texten" />}
            {perPage && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={`f-${perPage.meta.key}`} className={LABEL}>Tjänster per sida</label>
                <FieldControl {...perPage} invalid={!!perPage.problem} />
                <p className="text-[12.5px] leading-snug text-muted">Fler tjänster blir flera sidor, som besökaren bläddrar mellan med svep och prickar.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Informationsfält och meddelande (förstasidan) */}
      {launcher && (fields.length > 0 || message || messageUrl || footerPage.url) && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Informationsfält och meddelande</h4>
            <p className="text-[13px] text-muted">
              Längst ner på förstasidan. Finns något fält döljs textraden längst ner. En adress måste svara med ren text och ligga på en tillåten webbplats.
            </p>
          </div>
          {footerPage.url && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg bg-page p-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <LiveText field={footerPage.url} label="Fotrad som webbsida (valfri)" placeholder="Tomt: informationsfälten nedan" />
                <UrlNote field={footerPage.url} hostWarning={hostWarning} />
                <p className="text-[12.5px] leading-snug text-muted">
                  En hel webbsida längst ner i stället för informationsfälten. Sidan ritas för 1280 punkter bred (800 stående). Fälten visas bara om sidan inte går att ladda.
                </p>
              </div>
              {pageUrl && (
                <div className="grid gap-4 @md:grid-cols-3">
                  {footerPage.height && (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label htmlFor={`f-${footerPage.height.meta.key}`} className={LABEL}>Höjd</label>
                      <FieldControl {...footerPage.height} invalid={!!footerPage.height.problem} />
                      {/^\d+$/.test(footerPage.height.value?.trim() ?? "") && pageHeight !== Number(footerPage.height.value) && (
                        <p className="text-[12.5px] font-semibold text-warn-ink">Höjden ska vara 40–400. Enheten använder {pageHeight}.</p>
                      )}
                    </div>
                  )}
                  {footerPage.js && <SwitchField field={footerPage.js} label="Tillåt skript" />}
                  {footerPage.touch && <SwitchField field={footerPage.touch} label="Tar emot tryck" />}
                </div>
              )}
            </div>
          )}
          {fields.length > 0 && (
            <div className="mt-3 flex flex-col gap-2.5">
              {pageUrl && <p className="text-[12.5px] font-semibold text-muted">Reserv om webbsidan inte går att ladda:</p>}
              {fields.map((f, i) => (
                <InfoFieldRow key={f.meta.key} field={f} n={i + 1} hostWarning={hostWarning} />
              ))}
            </div>
          )}
          {(message || messageUrl) && (
            <div className="mt-4 grid gap-4 @xl:grid-cols-2">
              {message && <LiveText field={message} label="Meddelanderad" placeholder="Tom: ingen rad" />}
              {messageEn && <LiveText field={messageEn} label="Meddelanderad (English)" placeholder="Tomt: den svenska raden" />}
              {messageUrl && (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <LiveText field={messageUrl} label="Meddelande från adress (valfri)" placeholder="https://" />
                  <UrlNote field={messageUrl} hostWarning={hostWarning} />
                </div>
              )}
              <div className="grid gap-4 @md:grid-cols-2">
                {messageStyle && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`f-${messageStyle.meta.key}`} className={LABEL}>Färg</label>
                    <FieldControl {...messageStyle} invalid={!!messageStyle.problem} />
                  </div>
                )}
                {messageIcon && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`f-${messageIcon.meta.key}`} className={LABEL}>Ikon</label>
                    <div
                      className={`flex h-[38px] items-center gap-2 rounded-lg border px-2.5 ${messageIcon.value === null ? "border-dashed border-field bg-[#f8f9fa] text-muted" : "border-field bg-white"}`}
                    >
                      <AppIcon name={messageIconName} className="text-select-ink" />
                      <select
                        id={`f-${messageIcon.meta.key}`}
                        value={messageIconName}
                        onChange={(e) => messageIcon.onChange(e.target.value)}
                        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                      >
                        {messageIcon.meta.options.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {refresh && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`f-${refresh.meta.key}`} className={LABEL}>Hämta från adresser var</label>
                    <FieldControl {...refresh} invalid={!!refresh.problem} />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Attract loop (förstasidan, PubLiKiosk 3.17.0) */}
      {launcher && attract.url && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Attract loop</h4>
            <p className="text-[13px] text-muted">
              En helskärmssida (bildspel, siffror, film utan ljud) när förstasidan stått orörd en stund. Första trycket tar bort den och räknas inte som ett besök.
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <LiveText field={attract.url} label="Sida (valfri)" placeholder="Tomt: ingen attract loop" />
              <UrlNote field={attract.url} hostWarning={hostWarning} />
              <p className="text-[12.5px] leading-snug text-muted">
                Ritas för 1280 punkter bred (800 stående). Visar sidan film eller bilder från en annan webbplats måste den också vara tillåten. Svarar adressen inte visas förstasidan som vanligt.
              </p>
            </div>
            {attract.url.value?.trim() && (
              <div className="grid gap-4 @md:grid-cols-3">
                {attract.after && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`f-${attract.after.meta.key}`} className={LABEL}>Visas efter</label>
                    <FieldControl {...attract.after} invalid={!!attract.after.problem} />
                    {attract.after.value?.trim() === "0" && <p className="text-[12.5px] font-semibold text-warn-ink">0: attract loopen är avstängd.</p>}
                  </div>
                )}
                {attract.refresh && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`f-${attract.refresh.meta.key}`} className={LABEL}>Ladda om var</label>
                    <FieldControl {...attract.refresh} invalid={!!attract.refresh.problem} />
                  </div>
                )}
                {attract.js && <SwitchField field={attract.js} label="Tillåt skript" />}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Startknappen: tillbaka till början. Med flera tjänster som flikar är första fliken hem i stället */}
      {(homeLabel || homeIcon) && !launcher && homeTabs.length > 1 && (
        <p className="rounded-[10px] border border-line-soft px-4 py-3 text-[13px] text-muted">
          <b className="text-ink">Hem är första tjänsten.</b> Ändra dess namn och ikon i listan nedan. Startknappen används bara med förstasida eller med en enda tjänst.
        </p>
      )}
      {(homeLabel || homeIcon) && (launcher || homeTabs.length <= 1) && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Startknappen</h4>
            <p className="text-[13px] text-muted">
              {launcher
                ? "Knappen i ramen som tar besökaren tillbaka till förstasidan."
                : "Knappen i ramen som tar besökaren tillbaka till tjänsten, när enheten bara har en."}
            </p>
          </div>
          <div className="mt-3 grid gap-4 @xl:grid-cols-2">
            {homeLabel && <LiveText field={homeLabel} label="Namn på knappen" placeholder={launcher ? "Tomt: Startsida (Home page på engelska)" : "Tomt: Hem (Home på engelska)"} />}
            {homeIcon && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="home-icon" className={LABEL}>Ikon</label>
                <IconSelect id="home-icon" value={homeIconName} inherited={homeIcon.inherited || homeIcon.value === null} onChange={homeIcon.onChange} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tjänster / Fler webbappar */}
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h4 className="text-[15px] font-extrabold">Tjänster</h4>
            <span className={`text-[13px] ${rows.length > max ? "font-bold text-bad-ink" : "text-muted"}`}>
              {rows.length} av {max}
            </span>
          </div>
          <button
            type="button"
            disabled={rows.length >= max}
            onClick={() => commit([...rows, { ...EMPTY_APP, id: nextId++, adv: false }])}
            className="h-9 rounded-lg border-2 border-kth-blue bg-white px-3.5 text-[13.5px] font-bold text-kth-blue hover:bg-select disabled:opacity-40"
          >
            + Lägg till tjänst
          </button>
        </div>
        {!launcher && legacyHome && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-warn-bg px-3.5 py-3 text-[13px] text-warn-ink">
            <span className="min-w-0 flex-1">
              <b>Startsidan ligger kvar i det gamla formatet</b> (START_URL {legacyUrl.replace(/^https:\/\//, "")}). Enheten visar den som första flik, men den går inte att
              redigera här förrän den flyttats in bland tjänsterna. Alla nivåer på en gång:{" "}
              <Link href="/config/android-home" className="font-bold underline underline-offset-2">Startsidan blir första tjänst</Link>.
            </span>
            <button
              type="button"
              onClick={moveLegacyHome}
              disabled={rows.length >= max}
              className="h-9 rounded-lg border-2 border-kth-blue bg-white px-3 text-[13px] font-bold text-kth-blue hover:bg-select disabled:opacity-40"
            >
              Flytta in som första tjänst
            </button>
          </div>
        )}
        {apps.inherited && rows.length > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">Ärvt värde. En ändring här sätter apparna för just den här nivån.</p>
        )}

        {rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-field px-4 py-6 text-center text-sm text-muted">
            {legacyHome
              ? "Inga tjänster utöver startsidan ovan. Flytta in den som första tjänst."
              : "Inga tjänster. Lägg till minst en, annars har enheten inget att visa."}
          </div>
        ) : (
          <div ref={listRef} className="mt-3 flex flex-col" style={{ gap: GAP }}>
            {rows.map((r) => {
              const p = appProblems(r);
              const dragging = drag?.id === r.id;
              const showName = !!p.name && (!!r.name || (r.url.trim() !== "" && r.url.trim() !== "https://"));
              const showUrl = !!p.url && r.url.trim() !== "https://";
              return (
                <div
                  key={r.id}
                  data-app-card
                  className={`relative flex gap-3 rounded-[10px] border-2 p-3 sm:gap-4 sm:p-4 ${
                    dragging ? "z-10 border-kth-blue bg-[#f4f8fd] shadow-[0_12px_28px_rgba(0,0,40,.22)]" : "border-line bg-white"
                  }`}
                  style={dragging ? { transform: `translateY(${Math.round(drag.ty)}px)` } : undefined}
                >
                  <button
                    type="button"
                    aria-label={`Flytta ${r.name || "appen"}: dra uppåt eller nedåt`}
                    title="Dra för att flytta"
                    onPointerDown={(e) => onDown(e, r.id)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onLostPointerCapture={onUp}
                    className={`mt-6 flex h-[38px] w-8 shrink-0 touch-none select-none items-center justify-center rounded-lg border border-field bg-page text-muted ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] fill-none stroke-current stroke-[2.6] [stroke-linecap:round]">
                      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
                    </svg>
                  </button>
                  <div className="@container flex min-w-0 flex-1 flex-col gap-2.5">
                    <div className="grid gap-3 @xl:grid-cols-[1fr_2fr_1fr]">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <label htmlFor={`app-${r.id}-name`} className={LABEL}>{launcher ? "Namn på kortet" : "Namn på knappen"}</label>
                        <input
                          id={`app-${r.id}-name`}
                          value={r.name}
                          onChange={(e) => patch(r.id, { name: e.target.value })}
                          placeholder="t.ex. Sök böcker"
                          aria-invalid={showName || undefined}
                          className={`${INPUT} ${showName ? "border-bad-ink" : "border-field"}`}
                        />
                        {showName && <p className="text-[12.5px] font-semibold text-bad-ink">{p.name}</p>}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <label htmlFor={`app-${r.id}-url`} className={LABEL}>Adress</label>
                        <input
                          id={`app-${r.id}-url`}
                          value={r.url}
                          inputMode="url"
                          onChange={(e) => patch(r.id, { url: e.target.value })}
                          placeholder="https://"
                          aria-invalid={showUrl || undefined}
                          className={`${INPUT} font-mono text-[13px] ${showUrl ? "border-bad-ink" : "border-field"}`}
                        />
                        {showUrl && <p className="text-[12.5px] font-semibold text-bad-ink">{p.url}</p>}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <label htmlFor={`app-${r.id}-icon`} className={LABEL}>Ikon</label>
                        <IconSelect id={`app-${r.id}-icon`} value={r.icon} allowNone onChange={(icon) => patch(r.id, { icon })} />
                        {p.icon && <p className="text-[12.5px] font-semibold text-bad-ink">{p.icon}</p>}
                      </div>
                    </div>
                      <div className={`grid gap-3 ${launcher ? "@xl:grid-cols-[2fr_1fr]" : "max-w-[360px]"}`}>
                        {launcher && (
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <label htmlFor={`app-${r.id}-desc`} className={LABEL}>Beskrivning (en rad)</label>
                          <input
                            id={`app-${r.id}-desc`}
                            value={r.desc}
                            onChange={(e) => patch(r.id, { desc: e.target.value })}
                            placeholder="t.ex. Hitta böcker, artiklar och tidskrifter."
                            aria-invalid={!!p.desc || undefined}
                            className={`${INPUT} ${p.desc ? "border-bad-ink" : "border-field"}`}
                          />
                          {p.desc && <p className="text-[12.5px] font-semibold text-bad-ink">{p.desc}</p>}
                        </div>
                        )}
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <label htmlFor={`app-${r.id}-name-en`} className={LABEL}>{launcher ? "Namn (English)" : "Namn på knappen (English)"}</label>
                          <input
                            id={`app-${r.id}-name-en`}
                            value={r.nameEn}
                            onChange={(e) => patch(r.id, { nameEn: e.target.value })}
                            placeholder="Tomt: det svenska namnet"
                            aria-invalid={!!p.nameEn || undefined}
                            className={`${INPUT} ${p.nameEn ? "border-bad-ink" : "border-field"}`}
                          />
                          {p.nameEn ? (
                            <p className="text-[12.5px] font-semibold text-bad-ink">{p.nameEn}</p>
                          ) : (
                            !launcher && <p className="text-[12.5px] leading-snug text-muted">Visas mindre under det svenska namnet i ramen.</p>
                          )}
                        </div>
                        {launcher && (
                        <div className="flex min-w-0 flex-col gap-1.5 @xl:col-span-2">
                          <label htmlFor={`app-${r.id}-desc-en`} className={LABEL}>Beskrivning (English)</label>
                          <input
                            id={`app-${r.id}-desc-en`}
                            value={r.descEn}
                            onChange={(e) => patch(r.id, { descEn: e.target.value })}
                            placeholder="Tomt: den svenska beskrivningen"
                            aria-invalid={!!p.descEn || undefined}
                            className={`${INPUT} ${p.descEn ? "border-bad-ink" : "border-field"}`}
                          />
                          {p.descEn && <p className="text-[12.5px] font-semibold text-bad-ink">{p.descEn}</p>}
                        </div>
                        )}
                      </div>
                    {/* PubLiKiosk 3.16.0 och Linux-kiosken (publicom 36a1bbc) */}
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label htmlFor={`app-${r.id}-url-en`} className={LABEL}>Adress (English)</label>
                      <input
                        id={`app-${r.id}-url-en`}
                        value={r.urlEn}
                        inputMode="url"
                        onChange={(e) => patch(r.id, { urlEn: e.target.value })}
                        placeholder="Tomt: samma adress"
                        aria-invalid={!!p.urlEn || undefined}
                        className={`${INPUT} font-mono text-[13px] ${p.urlEn ? "border-bad-ink" : "border-field"}`}
                      />
                      {p.urlEn ? (
                        <p className="text-[12.5px] font-semibold text-bad-ink">{p.urlEn}</p>
                      ) : (
                        <p className="text-[12.5px] leading-snug text-muted">
                          Öppnas i stället för adressen när besökaren valt English. Skriv hela adressen som tjänsten vill ha den, t.ex. https://tjanst.kth.se/?lang=en.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        aria-expanded={r.adv}
                        onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, adv: !x.adv } : x)))}
                        className="self-start text-[13px] font-bold text-kth-blue"
                      >
                        {r.adv ? "Dölj avancerat" : "Avancerat: område"}
                      </button>
                      {r.adv && (
                        <div className="flex max-w-[520px] flex-col gap-1.5">
                          <label htmlFor={`app-${r.id}-scope`} className={LABEL}>Område</label>
                          <input
                            id={`app-${r.id}-scope`}
                            value={r.scope}
                            onChange={(e) => patch(r.id, { scope: e.target.value })}
                            placeholder="Samma som adressen"
                            className={`${INPUT} font-mono text-[13px] ${p.scope ? "border-bad-ink" : "border-field"}`}
                          />
                          {p.scope ? (
                            <p className="text-[12.5px] font-semibold text-bad-ink">{p.scope}</p>
                          ) : (
                            <p className="text-[12.5px] leading-snug text-muted">
                              Vilka sidor som räknas som den här appen. Lämna tomt: adressen och allt under den. Fyll i bara om appens sidor ligger någon annanstans.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => commit(rows.filter((x) => x.id !== r.id))}
                    className="mt-6 h-[38px] shrink-0 self-start rounded-lg border border-bad-bg bg-white px-3 text-[13px] font-bold text-bad-ink hover:bg-bad-bg"
                  >
                    Ta bort
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Förhandsvisning: förstasidan */}
      {launcher && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Så ser förstasidan ut</h4>
            <p className="text-[13px] text-muted">Liggande skärm, förminskad, första sidan. Kortens ordning följer listan ovan.</p>
            <div className="ml-auto inline-flex gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]" role="group" aria-label="Språk i förhandsvisningen">
              {[false, true].map((en) => (
                <button
                  key={String(en)}
                  type="button"
                  aria-pressed={english === en}
                  onClick={() => setEnglish(en)}
                  className={`h-[26px] rounded-[7px] px-2.5 text-[12.5px] font-semibold ${english === en ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"}`}
                >
                  {en ? "English" : "Svenska"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 w-full max-w-[640px] overflow-hidden rounded-xl border border-field bg-page" aria-label="Förhandsvisning av förstasidan">
            {/* Som appens huvud: logga till vänster, texten bredvid, English uppe till höger och linjemönstret
                nere till höger, aldrig bakom text eller logga (KTH:s grafiska manual) */}
            <div className="relative flex items-center gap-3.5 overflow-hidden bg-kth-navy py-4 pl-6 pr-28 text-white">
              <svg
                aria-hidden="true"
                viewBox="460 0 620 380"
                preserveAspectRatio="xMaxYMin slice"
                className="pointer-events-none absolute bottom-0 right-0 h-[61px] w-[100px] -scale-y-100 fill-none stroke-[#6a8ee0] stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
              >
                <polyline vectorEffect="non-scaling-stroke" points="0 120 240 120 -2 483" />
                <path vectorEffect="non-scaling-stroke" d="m600-3v243c-66.27,0-120-53.73-120-120h602.35" />
                <path vectorEffect="non-scaling-stroke" d="m720,0c0,198.82,161.18,360,360,360" />
              </svg>
              <span className="absolute right-4 top-3 flex h-5 items-center gap-1 rounded-full border border-[#5a6fb0] px-2 text-[9px] font-bold" aria-hidden="true">
                {english ? "Svenska" : "English"}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- liten förhandsvisning, ingen bildoptimering behövs */}
              <img src={kthLogoWhite.src} alt="KTH" width={44} height={49} className="relative h-[49px] w-11 shrink-0" />
              <div className="relative flex min-w-0 flex-col gap-0.5">
                <div className="text-xs font-bold tracking-[0.02em] text-kth-light-blue">{english ? "KTH Library" : "KTH Biblioteket"}</div>
                <div className="truncate text-[24px] font-extrabold leading-tight">{title}</div>
                <div className="truncate text-[13px] text-kth-light-blue">{subtitle}</div>
              </div>
            </div>
            {rows.length > 0 ? (
              <div className="p-3.5">
              <div className={`grid gap-2.5 ${pageSize <= 4 ? "grid-cols-2" : pageSize <= 6 ? "grid-cols-3" : "grid-cols-4"}`}>
                {rows.slice(0, pageSize).map((r) => (
                  <div key={r.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white p-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-kth-light-blue text-kth-blue">
                      <AppIcon name={r.icon} className="size-[26px]" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-extrabold text-kth-navy">
                        {(english && r.nameEn.trim()) || r.name.trim() || "Utan namn"}
                      </span>
                      {((english && r.descEn.trim()) || r.desc.trim()) && (
                        <span className="truncate text-[11px] text-muted">{(english && r.descEn.trim()) || r.desc}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {rows.length > pageSize && (
                <div className="mt-2.5 flex justify-center gap-1.5" aria-label={`Sida 1 av ${Math.ceil(rows.length / pageSize)}`}>
                  {Array.from({ length: Math.ceil(rows.length / pageSize) }, (_, i) => (
                    <span key={i} className={`size-1.5 rounded-full ${i === 0 ? "bg-kth-blue" : "bg-field"}`} />
                  ))}
                </div>
              )}
              </div>
            ) : (
              <div className="p-6 text-center text-[13px] text-muted">Inga tjänster att visa.</div>
            )}
            {messageText && (
              <div
                className={`flex items-center gap-2 px-6 py-2 text-xs font-semibold ${messageColors}`}
              >
                <AppIcon name={messageIconName} className="size-4" />
                <span className="truncate">{messageText}</span>
              </div>
            )}
            {pageUrl ? (
              // Skisspixlar: sidan ritas för 1280 bred, så höjden följer förhandsvisningens bredd
              <div
                className="flex items-center justify-center border-t border-dashed border-field bg-white px-6 text-center text-xs text-muted"
                style={{ aspectRatio: `1280 / ${pageHeight}` }}
              >
                <span className="truncate">Webbsida: {pageUrl.replace(/^https:\/\//, "")}</span>
              </div>
            ) : shownFields.length > 0 ? (
              <div className="flex items-center gap-4 bg-kth-light-blue px-6 py-2.5 text-kth-navy">
                {shownFields.map((f, i) =>
                  f.type === "clock" ? (
                    <span key={i} className="ml-auto shrink-0 text-[20px] font-extrabold leading-none">{clockNow}</span>
                  ) : (
                    <span key={i} className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[8px] font-bold uppercase tracking-[0.06em] text-kth-blue">{(english && f.labelEn) || f.label}</span>
                      <span className="truncate text-[15px] font-extrabold leading-none">{f.type === "url" ? "…" : f.value}</span>
                    </span>
                  ),
                )}
              </div>
            ) : (
              footer && <div className="border-t border-line bg-white px-6 py-2.5 text-xs text-[#3d4452]">{footer}</div>
            )}
          </div>
        </section>
      )}

      {/* Förhandsvisning: ramen */}
      {!launcher && (
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h4 className="text-[15px] font-extrabold">Så ser ramen ut</h4>
          <p className="text-[13px] text-muted">
            {homeTabs.length > 1
              ? "Första tjänsten är vald. De övriga ligger som flikar."
              : "Med en tjänst visas Tillbaka och startknappen när besökaren lämnat tjänsten."}
          </p>
        </div>
        {homeTabs.length > 0 && (() => {
          // Tvåspråkig som i kioskerna: svenska fet, engelska mindre under (namn_en; saknas det bara svenska).
          // Ikonen till vänster, eller ovanför texten när det är fler än fem knappar.
          // Flera tjänster: flikar, den första är hem. En tjänst: startknappen (START_LABEL/START_ICON).
          const tabs =
            homeTabs.length > 1
              ? homeTabs
              : [{ id: -1, sv: homeName, en: homeLabel?.value?.trim() ? "" : "Home", icon: homeIconName, home: true }];
          const stacked = tabs.length + 1 > 5;
          const button = `flex min-w-0 rounded-[10px] border-2 px-2 ${stacked ? "h-[76px] flex-col items-center justify-center gap-1 text-center" : "h-14 items-center justify-center gap-2"}`;
          const label = (sv: string, en: string) => (
            <span className={`flex min-w-0 max-w-full flex-col leading-tight ${stacked ? "w-full items-center" : ""}`}>
              <span className={`max-w-full truncate font-bold ${stacked ? "text-[13px]" : "text-[15px]"}`}>{sv}</span>
              {en && <span className={`max-w-full truncate font-medium opacity-70 ${stacked ? "text-[10.5px]" : "text-[11.5px]"}`}>{en}</span>}
            </span>
          );
          return (
            <div className="mt-3 flex items-center gap-2 overflow-hidden rounded-[10px] border border-line bg-white px-3 py-2.5" aria-label="Förhandsvisning av ramen">
              <span className={`${button} shrink-0 border-field opacity-45`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {label("Tillbaka", "Back")}
              </span>
              {tabs.map((c) => (
                <span key={c.id} className={`${button} flex-1 ${c.home ? "border-kth-blue bg-kth-blue text-white" : "border-field bg-white text-ink"}`}>
                  <AppIcon name={c.icon} className="size-5 shrink-0" />
                  {label(c.sv, c.en)}
                </span>
              ))}
            </div>
          );
        })()}
      </section>
      )}

      {apps.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{apps.problem}</p>}
    </div>
  );
}
