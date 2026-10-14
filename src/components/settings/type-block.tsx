"use client";

import type { EditorField } from "./apps-editor";

/**
 * What the device is for, as cards at the top of the settings (design "Skylt i admin"): Datortyp on
 * Linux (COMPUTER_TYPE), Börja med on Android (HOME_MODE). The settings below follow the choice.
 */
const CARDS: Record<string, Record<string, { title: string; text: string }>> = {
  COMPUTER_TYPE: {
    searchcomputer: { title: "Sökdator", text: "Söka och låna. Grupprum är sökdatorer med bokning." },
    guestcomputer: { title: "Gästdator", text: "Inloggning med gästkonto eller bibliotekskonto." },
    signage: { title: "Skylt", text: "Sidor i tur och ordning i helskärm. Inget går att trycka på." },
    kiosk: { title: "Kiosk", text: "Pekskärm med förstasida och tjänster." },
  },
  HOME_MODE: {
    launcher: { title: "Förstasida med tjänster", text: "Besökaren väljer bland stora kort." },
    app: { title: "Första tjänsten är hem", text: "Första tjänsten öppnas direkt, de övriga som flikar." },
    signage: { title: "Skylt", text: "Sidor i tur och ordning i helskärm. Inget går att trycka på." },
  },
};

/**
 * filter: in the base settings the cards only choose which settings to show (null = all types),
 * since the base settings hold every type's defaults; the default type itself is a row below them.
 */
export function TypeBlock({
  field,
  footer,
  filter,
}: {
  field: EditorField;
  footer?: React.ReactNode;
  filter?: { value: string | null; onPick: (v: string | null) => void };
}) {
  const key = field.meta.key;
  const android = key === "HOME_MODE";
  const cards = CARDS[key] ?? {};
  // Korten i designens ordning; val som katalogen har men korten inte känner till sist
  const options = [
    ...Object.keys(cards).filter((v) => field.meta.options.some((o) => o.value === v)),
    ...field.meta.options.map((o) => o.value).filter((v) => !(v in cards)),
  ];
  const current = filter ? filter.value : (field.value ?? field.meta.defaultValue);
  const title = (v: string) => cards[v]?.title ?? field.meta.options.find((o) => o.value === v)?.label ?? v;
  const pick = (v: string) => {
    // Standardvärdet sätts inte uttryckligen: det är vad enheten gör utan inställning
    if (v === field.meta.defaultValue && !field.inherited) field.onClear();
    else field.onChange(v);
  };
  const choices: (string | null)[] = filter ? [null, ...options] : options;
  const cols = choices.length >= 5 ? "@2xl:grid-cols-3 @5xl:grid-cols-5" : choices.length === 4 ? "@2xl:grid-cols-2 @4xl:grid-cols-4" : "@2xl:grid-cols-3";
  return (
    <section className="@container flex flex-col gap-3 rounded-xl border border-[#d9dde2] bg-white px-5 py-[18px]">
      <div>
        <h3 className="text-[17px] font-extrabold text-kth-navy">
          {filter ? "Visa inställningar för" : android ? "Börja med" : "Datortyp"}
        </h3>
        <p className="mt-[3px] text-[13px] text-[#5a6270]">
          {filter
            ? `Grundinställningarna gäller alla ${android ? "lägen" : "typer"}. Välj en för att bara se dess inställningar; det ändrar ingenting.`
            : android
              ? "Vad enheten är till för. Bara inställningarna för det valda läget visas."
              : "Vad datorn är till för. Bara inställningarna för den valda typen visas."}
        </p>
      </div>
      <div className={`grid gap-2.5 ${cols}`} role="group" aria-label={filter ? "Visa inställningar för" : android ? "Börja med" : "Datortyp"}>
        {choices.map((v) => {
          const on = current === v;
          const card = v === null ? { title: android ? "Alla lägen" : "Alla typer", text: "Alla inställningar, som de gäller som standard." } : (cards[v] ?? { title: title(v), text: "" });
          return (
            <button
              key={v ?? "__all"}
              type="button"
              aria-pressed={on}
              onClick={() => (filter ? filter.onPick(v) : v && pick(v))}
              className={`flex min-h-[92px] flex-col items-start gap-1 rounded-xl border-2 px-4 py-3.5 text-left ${on ? "border-kth-blue bg-[#f4f8fd]" : "border-[#e0e4e9] bg-white hover:border-field"}`}
            >
              <span className="text-[15px] font-extrabold text-kth-navy">{card.title}</span>
              <span className="text-[12.5px] leading-[1.35] text-[#5a6270]">{card.text}</span>
            </button>
          );
        })}
      </div>
      {filter && (
        <label className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-[13.5px]">
          <span className="font-bold">{android ? "Enheter vars profil inte anger något läge börjar med" : "Datorer vars profil inte anger någon typ blir"}</span>
          <select
            id={`f-${key}`}
            value={field.value ?? field.meta.defaultValue ?? ""}
            onChange={(e) => pick(e.target.value)}
            className="h-9 rounded-lg border border-field bg-white px-2.5 text-sm"
          >
            {options.map((v) => <option key={v} value={v}>{title(v)}</option>)}
          </select>
        </label>
      )}
      {field.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{field.problem}</p>}
      {footer}
    </section>
  );
}
