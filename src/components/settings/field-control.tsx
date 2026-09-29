"use client";

import { useState } from "react";
import { joinList, splitList, type CatalogEntry } from "@/lib/settings-shared";

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
