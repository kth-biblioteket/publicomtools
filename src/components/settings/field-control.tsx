"use client";

import { useRef, useState } from "react";
import { joinList, previewUrl, screensaverMediaId, splitList, type CatalogEntry } from "@/lib/settings-shared";
import type { SignageProps, SignMedia } from "./signage-editor";

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
  /** The media library, for the screensaver list: pick a library image or upload one */
  signage?: SignageProps;
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
  const addParts = (raw: string) => {
    // Komma, och radbrytningar från en inklistrad lista med en per rad (mellanslag också i listor med mellanslag)
    const parts = [...new Set(raw.split(meta.separator === " " ? /[\s,]+/ : /[,\r\n]+/).map((p) => p.trim()).filter(Boolean))].filter((p) => !items.includes(p));
    if (parts.length) onChange(joinList([...items, ...parts], meta.separator));
  };
  const add = () => {
    addParts(text);
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
        onPaste={(e) => {
          // En input på en rad slår ihop inklistrade rader: dela upp listan själv
          const pasted = e.clipboardData.getData("text");
          if (!/[\r\n,]/.test(pasted)) return;
          e.preventDefault();
          addParts(text + pasted);
          setText("");
        }}
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

/** A library image as a thumbnail, letterboxed like the repo's preview images */
function MediaThumb({ src, className = "" }: { src: string; className?: string }) {
  return (
    <div className={`flex aspect-video items-center justify-center overflow-hidden rounded-md bg-kth-navy ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the library's own file, same origin */}
      <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
    </div>
  );
}

/**
 * csv whose options have preview images (SCREENSAVER_FILES): an ordered pick from the options. With the media library
 * (signage) the list can also hold library images, stored as <origin>/api/sign/f/<id>?format=jpeg, and a new image
 * can be uploaded (a pdf adds a page each; films can't be a screensaver and are skipped).
 */
function ImageList({ id, meta, value, inherited, onChange, signage }: Props & { id: string }) {
  const items = value ? splitList(value, meta.separator) : [];
  const set = (next: string[]) => onChange(joinList(next, meta.separator));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const [library, setLibrary] = useState<SignMedia[]>(signage?.media.filter((m) => m.kind === "image") ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlOf = (m: { id: string }) => `${signage!.screensaverBase}${m.id}?format=jpeg`;
  const left = meta.options.filter((o) => !items.includes(o.value));
  const leftMedia = signage ? library.filter((m) => !items.includes(urlOf(m))) : [];
  const upload = async (file: File) => {
    setError(null);
    setBusy(file.name);
    try {
      const res = await fetch(signage!.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { items?: SignMedia[]; error?: string };
      if (!res.ok || !json.items) setError(json.error ?? `Uppladdningen misslyckades (${res.status}).`);
      else {
        const images = json.items.filter((m) => m.kind === "image");
        if (!images.length) setError("En film kan inte vara skärmsläckare. Ladda upp en bild eller en pdf.");
        else {
          setLibrary((l) => [...images.filter((x) => !l.some((y) => y.id === x.id)), ...l]);
          set([...items, ...images.map(urlOf).filter((u) => !items.includes(u))]);
        }
      }
    } catch {
      setError("Uppladdningen avbröts. Kontrollera nätet och försök igen.");
    } finally {
      setBusy(null);
    }
  };
  const btn = "flex size-7 items-center justify-center rounded-md text-muted hover:bg-[#eceef1] hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div id={id} className="flex flex-col gap-2">
      {items.length > 0 ? (
        <ol aria-label={`Valda: ${meta.label}`} className={`flex flex-col gap-1.5 rounded-lg border p-1.5 ${tone(inherited, false)}`}>
          {items.map((item, i) => {
            const o = meta.options.find((x) => x.value === item);
            const mediaId = o ? null : screensaverMediaId(item);
            const m = mediaId ? library.find((x) => x.id === mediaId) : undefined;
            const label = o ? o.label : mediaId ? (m?.name ?? "Bild från mediebiblioteket") : item;
            return (
              <li key={`${item}-${i}`} className="flex items-center gap-2.5 rounded-md bg-white p-1 pr-1.5 shadow-[0_0_0_1px_var(--color-line)]">
                <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
                {mediaId && signage ? <MediaThumb src={`${signage.fileBase}${mediaId}`} className="w-24 shrink-0" /> : <Thumb option={o} className="w-24 shrink-0" />}
                <span className="min-w-0 flex-1 text-[13px] leading-tight">
                  {o || mediaId ? label : <span className="break-all font-mono text-xs">{item}</span>}
                  {mediaId && <span className="mt-0.5 block text-[11.5px] text-muted">Mediebiblioteket</span>}
                  {!o && !mediaId && <span className="mt-0.5 block text-[11.5px] font-semibold text-warn-ink">Finns inte bland valen</span>}
                </span>
                <span className="flex shrink-0 items-center">
                  <button type="button" aria-label={`Flytta upp ${label}`} disabled={i === 0} onClick={() => move(i, -1)} className={btn}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Flytta ner ${label}`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={btn}>
                    ↓
                  </button>
                  <button type="button" aria-label={`Ta bort ${label}`} onClick={() => set(items.filter((_, j) => j !== i))} className={`${btn} text-base`}>
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
      {signage && (
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-[12.5px] font-semibold text-muted">Från mediebiblioteket</p>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
              className="h-8 rounded-lg border-2 border-kth-blue bg-white px-3 text-[12.5px] font-bold text-kth-blue hover:bg-select disabled:opacity-40"
            >
              {busy ? `Laddar upp ${busy}…` : "Ladda upp…"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          {error && <p className="mb-1 text-[12.5px] font-semibold text-bad-ink">{error}</p>}
          {leftMedia.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {leftMedia.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Lägg till ${m.name}`}
                  onClick={() => set([...items, urlOf(m)])}
                  className="group flex flex-col gap-1 rounded-lg border border-line bg-white p-1.5 text-left hover:border-kth-blue"
                >
                  <MediaThumb src={`${signage.fileBase}${m.id}`} />
                  <span className="flex items-start gap-1 px-0.5 text-[12px] leading-tight text-ink">
                    <span className="font-bold text-kth-blue">+</span>
                    {m.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">Inga fler bilder i mediebiblioteket. Ladda upp en, så läggs den till i listan.</p>
          )}
          <p className="mt-1 text-[12px] text-muted">Bilden hämtas av datorn vid start som JPEG. Bäst är 16:9, till exempel 1920 × 1080.</p>
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


