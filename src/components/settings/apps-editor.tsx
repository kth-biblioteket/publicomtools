"use client";

import { useEffect, useRef, useState } from "react";
import { APP_ICONS, appProblems, MAX_APPS, parseApps, serializeApps, type AppEntry, type CatalogEntry } from "@/lib/settings-shared";
import { AppIcon } from "@/components/ui/app-icons";
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
const toValue = (rows: Row[]) => serializeApps(rows.map(({ name, url, icon, scope }) => ({ name, url, icon, scope })));

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
 * The Android tablets' web apps: the home app (START_URL, START_LABEL, START_ICON) and up to
 * five more (APPS, one per line "Namn|https://adress/|ikon|område"). Rows are reordered by
 * dragging the handle: pointer events with capture, so the row itself follows the pointer
 * (no browser drag image) and the others move aside as its edge passes their middle.
 */
export function AppsEditor({
  apps,
  homeUrl,
  homeLabel,
  homeIcon,
}: {
  apps: EditorField;
  homeUrl?: EditorField;
  homeLabel?: EditorField;
  homeIcon?: EditorField;
}) {
  const external = apps.value ?? "";
  const [rows, setRows] = useState<Row[]>(() => toRows(apps.value));
  // Ångra, Ångra alla or a save outside the editor: show the value it now has
  const [synced, setSynced] = useState(external);
  if (external !== synced) {
    setSynced(external);
    if (toValue(rows) !== external) setRows(toRows(apps.value));
  }

  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; hs: number[]; startY: number; startTop: number; cur: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; ty: number } | null>(null);

  const commit = (next: Row[]) => {
    setRows(next);
    const value = toValue(next);
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

  const homeName = homeLabel?.value?.trim() || "Hem";
  const homeIconName = homeIcon?.value ?? homeIcon?.meta.defaultValue ?? "house";

  return (
    <div className="flex flex-col gap-4">
      {/* Startsidan */}
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h4 className="text-[15px] font-extrabold">Startsida</h4>
          <p className="text-[13px] text-muted">Hem-appen. Dit går enheten tillbaka när ingen använder den, och med knappen längst till vänster.</p>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
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

      {/* Fler webbappar */}
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h4 className="text-[15px] font-extrabold">Fler webbappar</h4>
            <span className="text-[13px] text-muted">
              {rows.length} av {MAX_APPS}
            </span>
          </div>
          <button
            type="button"
            disabled={rows.length >= MAX_APPS}
            onClick={() => commit([...rows, { id: nextId++, name: "", url: "https://", icon: "info", scope: "", adv: false }])}
            className="h-9 rounded-lg border-2 border-kth-blue bg-white px-3.5 text-[13.5px] font-bold text-kth-blue hover:bg-select disabled:opacity-40"
          >
            + Lägg till app
          </button>
        </div>
        {apps.inherited && rows.length > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">Ärvt värde. En ändring här sätter apparna för just den här nivån.</p>
        )}

        {rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-field px-4 py-6 text-center text-sm text-muted">
            Inga fler appar. Enheten visar bara startsidan, som i dag.
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
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <label htmlFor={`app-${r.id}-name`} className={LABEL}>Namn på knappen</label>
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

      {/* Förhandsvisning */}
      <section className="rounded-[10px] border border-line-soft px-4 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h4 className="text-[15px] font-extrabold">Så ser ramen ut</h4>
          <p className="text-[13px] text-muted">
            {rows.length ? "Hem-appen är vald. Ramen visas alltid när det finns fler än en app." : "Med bara startsidan visas ramen som i dag: Tillbaka och Hem när besökaren lämnat appen."}
          </p>
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex h-[68px] items-center gap-2.5 overflow-hidden rounded-[10px] border border-line bg-white px-3" aria-label="Förhandsvisning av ramen">
            <span className="flex h-12 shrink-0 items-center rounded-[10px] border-2 border-field px-3 text-[15px] font-bold opacity-45">‹ Tillbaka</span>
            <div className="flex min-w-0 flex-1 gap-2">
              {[{ id: 0, label: homeName, icon: homeIconName, home: true }, ...rows.map((r) => ({ id: r.id, label: r.name.trim() || "Utan namn", icon: r.icon, home: false }))].map((c) => (
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

      {apps.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{apps.problem}</p>}
    </div>
  );
}
