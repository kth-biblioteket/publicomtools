"use client";

import { useEffect, useRef, useState } from "react";
import { APP_ICONS, appProblems, MAX_APPS, MAX_APPS_LAUNCHER, parseApps, serializeApps, type AppEntry, type CatalogEntry } from "@/lib/settings-shared";
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
}: {
  apps: EditorField;
  homeUrl?: EditorField;
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
}) {
  const launcher = (homeMode?.value ?? homeMode?.meta.defaultValue ?? "app") === "launcher";
  // Utan START_URL (Linux-kiosken) är första tjänsten hem, och START_LABEL/START_ICON är startknappen
  // som tar besökaren tillbaka till början, i båda lägena
  const firstAppHome = !homeUrl;
  const max = launcher || firstAppHome ? MAX_APPS_LAUNCHER : MAX_APPS;
  const external = apps.value ?? "";
  const [rows, setRows] = useState<Row[]>(() => toRows(apps.value));
  // Ångra, Ångra alla or a save outside the editor: show the value it now has
  const [synced, setSynced] = useState(external);
  if (external !== synced) {
    setSynced(external);
    if (toValue(rows, alwaysJson) !== external) setRows(toRows(apps.value));
  }

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
              title={firstAppHome ? "Första tjänsten är hem" : "En app"}
              text={
                firstAppHome
                  ? "Första tjänsten öppnas direkt. De övriga ligger som flikar i navigeringen."
                  : "Som i dag: en app är startsida. Fler appar går att växla till i ramen."
              }
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
            {firstAppHome
              ? launcher
                ? "Efter inaktivitet går datorn tillbaka till förstasidan med ny session."
                : "Efter inaktivitet går datorn tillbaka till första tjänsten med ny session."
              : launcher
                ? "Startsidan (START_URL) används inte. Efter inaktivitet går enheten tillbaka till förstasidan med ny session. Har enheten bara en tjänst går den direkt in i den."
                : "Hem-appen är startsida, och efter inaktivitet går enheten tillbaka till den. Med fler appar visas ramen alltid."}
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
          </div>
        </section>
      )}

      {/* Startknappen (Linux-kiosken): tillbaka till början, i båda lägena */}
      {firstAppHome && (homeLabel || homeIcon) && (
        <section className="rounded-[10px] border border-line-soft px-4 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h4 className="text-[15px] font-extrabold">Startknappen</h4>
            <p className="text-[13px] text-muted">Knappen i navigeringen som tar besökaren tillbaka till början.</p>
          </div>
          <div className="mt-3 grid gap-4 @xl:grid-cols-2">
            {homeLabel && <LiveText field={homeLabel} label="Namn på knappen" placeholder="Tomt: Startsida (Home på engelska)" />}
            {homeIcon && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="home-icon" className={LABEL}>Ikon</label>
                <IconSelect id="home-icon" value={homeIconName} inherited={homeIcon.inherited || homeIcon.value === null} onChange={homeIcon.onChange} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Startsidan */}
      {!launcher && !firstAppHome && (
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h4 className="text-[15px] font-extrabold">Startsida</h4>
          <p className="text-[13px] text-muted">Hem-appen. Dit går enheten tillbaka när ingen använder den, och med knappen längst till vänster.</p>
        </div>
        <div className="mt-3 grid gap-4 @2xl:grid-cols-[2fr_1fr_1fr]">
          {homeUrl && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`f-${homeUrl.meta.key}`} className={LABEL}>Adress</label>
              <FieldControl {...homeUrl} invalid={!!homeUrl.problem} />
              {homeUrl.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{homeUrl.problem}</p>}
            </div>
          )}
          {homeLabel && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`f-${homeLabel.meta.key}`} className={LABEL}>Namn på knappen</label>
              <FieldControl {...homeLabel} invalid={!!homeLabel.problem} />
              {homeLabel.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{homeLabel.problem}</p>}
            </div>
          )}
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
            <h4 className="text-[15px] font-extrabold">{launcher || firstAppHome ? "Tjänster" : "Fler webbappar"}</h4>
            <span className={`text-[13px] ${rows.length > max ? "font-bold text-bad-ink" : "text-muted"}`}>
              {rows.length} av {max}
            </span>
          </div>
          <button
            type="button"
            disabled={rows.length >= max}
            onClick={() => commit([...rows, { id: nextId++, name: "", url: "https://", icon: "info", scope: "", desc: "", nameEn: "", descEn: "", adv: false }])}
            className="h-9 rounded-lg border-2 border-kth-blue bg-white px-3.5 text-[13.5px] font-bold text-kth-blue hover:bg-select disabled:opacity-40"
          >
            {launcher || firstAppHome ? "+ Lägg till tjänst" : "+ Lägg till app"}
          </button>
        </div>
        {apps.inherited && rows.length > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">Ärvt värde. En ändring här sätter apparna för just den här nivån.</p>
        )}

        {rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-field px-4 py-6 text-center text-sm text-muted">
            {launcher || firstAppHome
              ? "Inga tjänster. Lägg till minst en, annars har förstasidan inget att visa."
              : "Inga fler appar. Enheten visar bara startsidan, som i dag."}
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
                    {launcher && (
                      <div className="grid gap-3 @xl:grid-cols-[2fr_1fr]">
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
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <label htmlFor={`app-${r.id}-name-en`} className={LABEL}>Namn (English)</label>
                          <input
                            id={`app-${r.id}-name-en`}
                            value={r.nameEn}
                            onChange={(e) => patch(r.id, { nameEn: e.target.value })}
                            placeholder="Tomt: det svenska namnet"
                            aria-invalid={!!p.nameEn || undefined}
                            className={`${INPUT} ${p.nameEn ? "border-bad-ink" : "border-field"}`}
                          />
                          {p.nameEn && <p className="text-[12.5px] font-semibold text-bad-ink">{p.nameEn}</p>}
                        </div>
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
                      </div>
                    )}
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
            <p className="text-[13px] text-muted">Liggande skärm, förminskad. Kortens ordning följer listan ovan.</p>
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
              <div className="grid grid-cols-2 gap-2.5 p-3.5">
                {rows.slice(0, MAX_APPS_LAUNCHER).map((r) => (
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
            ) : (
              <div className="p-6 text-center text-[13px] text-muted">Inga tjänster att visa.</div>
            )}
            {footer && <div className="border-t border-line bg-white px-6 py-2.5 text-xs text-[#3d4452]">{footer}</div>}
          </div>
        </section>
      )}

      {/* Förhandsvisning: ramen */}
      {!launcher && (
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h4 className="text-[15px] font-extrabold">Så ser ramen ut</h4>
          <p className="text-[13px] text-muted">
            {firstAppHome
              ? "Första tjänsten är vald. De övriga ligger som flikar."
              : rows.length
                ? "Hem-appen är vald. Ramen visas alltid när det finns fler än en app."
                : "Med bara startsidan visas ramen som i dag: Tillbaka och Hem när besökaren lämnat appen."}
          </p>
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex h-[68px] items-center gap-2.5 overflow-hidden rounded-[10px] border border-line bg-white px-3" aria-label="Förhandsvisning av ramen">
            <span className="flex h-12 shrink-0 items-center rounded-[10px] border-2 border-field px-3 text-[15px] font-bold opacity-45">‹ Tillbaka</span>
            <div className="flex min-w-0 flex-1 gap-2">
              {(firstAppHome
                ? rows.map((r, i) => ({ id: r.id, label: r.name.trim() || "Utan namn", icon: r.icon, home: i === 0 }))
                : [{ id: 0, label: homeName, icon: homeIconName, home: true }, ...rows.map((r) => ({ id: r.id, label: r.name.trim() || "Utan namn", icon: r.icon, home: false }))]
              ).map((c) => (
                <span
                  key={c.id}
                  className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border-2 px-2 text-[15px] font-bold ${
                    c.home ? "border-kth-blue bg-kth-blue text-white" : "border-field bg-white text-ink"
                  }`}
                >
                  <AppIcon name={c.icon} />
                  <span className="truncate">{c.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {apps.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{apps.problem}</p>}
    </div>
  );
}
