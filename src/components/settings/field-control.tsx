"use client";

import { useState } from "react";
import {
  joinList,
  parseSignPages,
  previewUrl,
  serializeSignPages,
  SIGN_PAGES_KEY,
  SIGN_SECONDS_MAX,
  SIGN_SECONDS_MIN,
  splitList,
  type CatalogEntry,
  type SignPage,
} from "@/lib/settings-shared";

const INPUT = "h-[38px] w-full rounded-lg border px-3 text-sm";

/** Same look as an inherited value: dashed and grey, still editable. */
function tone(inherited: boolean, invalid: boolean) {
  if (invalid) return "border-bad-ink bg-white";
  return inherited ? "border-dashed border-field bg-[#f8f9fa] text-muted" : "border-field bg-white";
}

/** "30000 millisekunder" → "30 s", "90 minuter" → "1 tim 30 min" */
function humanize(value: string, unit: string | null): string | null {
  const n = Number(value);
  if (!unit || !Number.isFinite(n) || n <= 0) return null;
  const seconds = unit === "millisekunder" ? n / 1000 : unit === "sekunder" ? n : unit === "minuter" ? n * 60 : null;
  if (seconds === null || (unit === "minuter" && n < 60) || (unit === "sekunder" && n < 60)) return null;
  if (seconds < 60) return `${seconds} s`;
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h ? `${h} tim${m ? ` ${m} min` : ""}` : `${m} min`;
}

type Props = {
  meta: CatalogEntry;
  /** The value shown: own, drafted or inherited; null when nothing is set anywhere */
  value: string | null;
  inherited: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  /** An emptied number field means "don't set it here" */
  onClear: () => void;
};

/** Commits on blur or Enter, so typing doesn't create a draft per keystroke. */
function TextField({ id, meta, value, inherited, invalid, onChange, onClear }: Props & { id: string }) {
  const [text, setText] = useState(value ?? "");
  const commit = () => {
    if (text === (value ?? "")) return;
    if (meta.type === "int" && text.trim() === "") onClear();
    else onChange(meta.type === "int" ? text.trim() : text);
  };
  const human = meta.type === "int" ? humanize(text, meta.unit) : null;
  const input = (
    <input
      id={id}
      value={text}
      inputMode={meta.type === "int" ? "numeric" : meta.type === "url" ? "url" : undefined}
      placeholder={value === null ? (meta.defaultValue ? `Standard: ${meta.defaultValue}` : "Inte satt") : meta.example ?? undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      aria-invalid={invalid || undefined}
      className={`${INPUT} ${tone(inherited, invalid)} ${meta.type === "int" ? "max-w-[140px]" : ""} ${meta.type === "url" || meta.type === "string" ? "font-mono text-[13px]" : ""}`}
    />
  );
  if (meta.type !== "int") return input;
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      {input}
      {meta.unit}
      {human && <span>({human})</span>}
    </div>
  );
}

function TagField({ id, meta, value, inherited, onChange }: Props & { id: string }) {
  const items = value ? splitList(value, meta.separator) : [];
  const [text, setText] = useState("");
  const add = () => {
    const parts = splitList(text, meta.separator === " " ? " " : ",").filter((p) => !items.includes(p));
    if (parts.length) onChange(joinList([...items, ...parts], meta.separator));
    setText("");
  };
  return (
    <div
      className={`flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border px-1.5 py-[5px] ${tone(inherited, false)}`}
    >
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-md bg-[#eceef1] pl-2 font-mono text-xs text-ink">
          <span className="truncate">{item}</span>
          <button
            type="button"
            aria-label={`Ta bort ${item}`}
            onClick={() => onChange(joinList(items.filter((_, j) => j !== i), meta.separator))}
            className="flex size-5 items-center justify-center text-sm text-muted hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || (e.key === "," && meta.separator === ",")) {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Lägg till…"
        aria-label={`Lägg till i ${meta.label}`}
        className="min-w-[120px] flex-1 bg-transparent px-1 text-[13px] outline-none"
      />
    </div>
  );
}

type Option = CatalogEntry["options"][number];

/** A preview image from the publicom repo, letterboxed so portrait images fit too. */
function Thumb({ option, className = "" }: { option?: Option; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`flex aspect-video items-center justify-center overflow-hidden rounded-md bg-kth-navy ${className}`}>
      {option?.preview && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, already small; next/image would need remotePatterns
        <img
          src={previewUrl(option.preview)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      ) : (
        <span className="px-2 text-center text-[11px] text-white/70">{option ? "Ingen bild" : "Okänd bild"}</span>
      )}
    </div>
  );
}

/** enum whose options have preview images: one card per image instead of a select. */
function ImageChoice({ id, meta, value, inherited, invalid, onChange }: Props & { id: string }) {
  const chosen = value ?? meta.defaultValue;
  const extra = value !== null && !meta.options.some((o) => o.value === value);
  const cards: { value: string; option?: Option; label: string }[] = [
    ...meta.options.map((o) => ({ value: o.value, option: o, label: o.label })),
    ...(extra ? [{ value: value!, label: value || "(tomt)" }] : []),
  ];
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={meta.label}
      aria-invalid={invalid || undefined}
      className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2"
    >
      {cards.map((c) => {
        const on = c.value === chosen;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => c.value !== value && onChange(c.value)}
            className={`flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors ${
              on
                ? `${inherited || value === null ? "border-dashed" : ""} border-kth-blue bg-select ring-1 ring-kth-blue`
                : "border-line bg-white hover:border-field"
            } ${on && invalid ? "border-bad-ink ring-bad-ink" : ""}`}
          >
            <Thumb option={c.option} />
            <span className={`px-0.5 text-[12.5px] leading-tight ${on ? "font-semibold text-select-ink" : "text-ink"} ${!c.option ? "break-all font-mono" : ""}`}>
              {c.label}
              {c.value === meta.defaultValue && <span className="ml-1 font-normal text-muted">(standard)</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** csv whose options have preview images (SCREENSAVER_FILES): an ordered pick from the options, no free text. */
function ImageList({ id, meta, value, inherited, onChange }: Props & { id: string }) {
  const items = value ? splitList(value, meta.separator) : [];
  const set = (next: string[]) => onChange(joinList(next, meta.separator));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const left = meta.options.filter((o) => !items.includes(o.value));
  const btn = "flex size-7 items-center justify-center rounded-md text-muted hover:bg-[#eceef1] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div id={id} className="flex flex-col gap-2">
      {items.length > 0 ? (
        <ol aria-label={`Valda: ${meta.label}`} className={`flex flex-col gap-1.5 rounded-lg border p-1.5 ${tone(inherited, false)}`}>
          {items.map((item, i) => {
            const o = meta.options.find((x) => x.value === item);
            return (
              <li key={`${item}-${i}`} className="flex items-center gap-2.5 rounded-md bg-white p-1 pr-1.5 shadow-[0_0_0_1px_var(--color-line)]">
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
                <Thumb option={o} className="w-24 shrink-0" />
                <span className="min-w-0 flex-1 text-[13px] leading-tight">
                  {o ? o.label : <span className="break-all font-mono text-xs">{item}</span>}
                  {!o && <span className="mt-0.5 block text-[11.5px] font-semibold text-warn-ink">Finns inte bland valen</span>}
                </span>
                <span className="flex shrink-0 items-center">
                  <button type="button" aria-label={`Flytta upp ${o?.label ?? item}`} disabled={i === 0} onClick={() => move(i, -1)} className={btn}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Flytta ner ${o?.label ?? item}`}
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                    className={btn}
                  >
                    ↓
                  </button>
                  <button type="button" aria-label={`Ta bort ${o?.label ?? item}`} onClick={() => set(items.filter((_, j) => j !== i))} className={`${btn} text-base`}>
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={`rounded-lg border px-3 py-2 text-[13px] ${tone(inherited, false)}`}>Inga bilder valda.</p>
      )}
      {left.length > 0 && (
        <div>
          <p className="mb-1 text-[12.5px] font-semibold text-muted">Lägg till</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
            {left.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-label={`Lägg till ${o.label}`}
                onClick={() => set([...items, o.value])}
                className="group flex flex-col gap-1 rounded-lg border border-line bg-white p-1.5 text-left hover:border-kth-blue"
              >
                <Thumb option={o} />
                <span className="flex items-start gap-1 px-0.5 text-[12px] leading-tight text-ink">
                  <span className="font-bold text-kth-blue">+</span>
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FieldControl(props: Props) {
  const { meta, value, inherited, onChange } = props;
  const id = `f-${meta.key}`;

  if (meta.type === "bool") {
    const on = (value ?? meta.defaultValue) === "true";
    return (
      <div className="flex items-center gap-2.5 text-sm">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={meta.label}
          onClick={() => onChange(on ? "false" : "true")}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-kth-blue" : "bg-field"} ${inherited ? "opacity-70" : ""}`}
        >
          <span className={`absolute top-[3px] size-[18px] rounded-full bg-white shadow transition-[left] ${on ? "left-[19px]" : "left-[3px]"}`} />
        </button>
        <span className={inherited ? "text-muted" : ""}>{on ? "På" : "Av"}</span>
      </div>
    );
  }

  if (meta.key === SIGN_PAGES_KEY) return <SignPages id={id} {...props} />;

  const withImages = meta.options.some((o) => o.preview);
  if (meta.type === "enum" && withImages) return <ImageChoice id={id} {...props} />;
  if (meta.type === "csv" && meta.options.length) return <ImageList id={id} {...props} />;

  if (meta.type === "enum") {
    return (
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={meta.label}
        className={`${INPUT} px-2.5 ${tone(inherited, props.invalid)}`}
      >
        {value === null && <option value="">{meta.defaultValue ? `Standard (${meta.options.find((o) => o.value === meta.defaultValue)?.label ?? meta.defaultValue})` : "Välj…"}</option>}
        {value !== null && !meta.options.some((o) => o.value === value) && <option value={value}>{value || "(tomt)"}</option>}
        {meta.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (meta.type === "csv") return <TagField key={value ?? ""} id={id} {...props} />;
  return <TextField key={value ?? ""} id={id} {...props} />;
}

/**
 * SIGN_PAGES: the pages a sign rotates between, one row per page (address and seconds; empty
 * seconds = Tid per sida). Written as a JSON list, which the kiosk shell reads.
 */
function SignPages({ id, meta, value, inherited, invalid, onChange }: Props & { id: string }) {
  const [rows, setRows] = useState<SignPage[]>(() => parseSignPages(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // Ångra, Ta bort eller ett nytt arv: visa det som gäller nu
    setSeen(value);
    setRows(parseSignPages(value));
  }
  const commit = (next: SignPage[]) => {
    setRows(next);
    const text = serializeSignPages(next.filter((p) => p.url.trim()));
    setSeen(text || null);
    onChange(text);
  };
  const patch = (i: number, p: Partial<SignPage>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };
  const btn = "size-7 shrink-0 rounded-md text-muted hover:bg-page disabled:opacity-30";

  return (
    <div id={id} role="group" aria-label={meta.label} className={`flex w-full min-w-0 flex-col gap-1.5 ${inherited ? "opacity-80" : ""}`}>
      {rows.length === 0 && <p className="text-[13px] text-muted">Inga sidor: skylten visar den första av Startsidorna.</p>}
      {rows.map((p, i) => (
        <div key={i} className="flex w-full min-w-0 flex-wrap items-center gap-1">
          <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
          <input
            type="url"
            value={p.url}
            placeholder="https://apps.lib.kth.se/skylt/…"
            aria-label={`Sida ${i + 1}, adress`}
            onChange={(e) => patch(i, { url: e.target.value })}
            onBlur={() => commit(rows)}
            onKeyDown={(e) => e.key === "Enter" && commit(rows)}
            className={`h-[38px] min-w-[180px] flex-1 rounded-lg border px-3 text-sm ${tone(inherited, invalid)}`}
          />
          <input
            type="number"
            min={SIGN_SECONDS_MIN}
            max={SIGN_SECONDS_MAX}
            value={p.s ?? ""}
            placeholder="sek"
            title="Sekunder (tomt: Tid per sida)"
            aria-label={`Sida ${i + 1}, sekunder`}
            onChange={(e) => patch(i, { s: e.target.value === "" ? null : Math.round(Number(e.target.value)) })}
            onBlur={() => commit(rows)}
            className={`h-[38px] w-[72px] shrink-0 rounded-lg border px-2 text-sm ${tone(inherited, invalid)}`}
          />
          <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => move(i, -1)} className={btn}>↑</button>
          <button type="button" aria-label="Flytta ner" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className={btn}>↓</button>
          <button type="button" aria-label={`Ta bort sida ${i + 1}`} onClick={() => commit(rows.filter((_, j) => j !== i))} className={`${btn} text-base`}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => setRows((r) => [...r, { url: "", s: null }])} className="self-start text-[13px] font-bold text-kth-blue">
        + Lägg till sida
      </button>
    </div>
  );
}
