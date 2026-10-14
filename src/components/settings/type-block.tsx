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

export function TypeBlock({ field, footer }: { field: EditorField; footer?: React.ReactNode }) {
  const key = field.meta.key;
  const android = key === "HOME_MODE";
  const cards = CARDS[key] ?? {};
  // Korten i designens ordning; val som katalogen har men korten inte känner till sist
  const options = [
    ...Object.keys(cards).filter((v) => field.meta.options.some((o) => o.value === v)),
    ...field.meta.options.map((o) => o.value).filter((v) => !(v in cards)),
  ];
  const current = field.value ?? field.meta.defaultValue;
  const pick = (v: string) => {
    // Standardvärdet sätts inte uttryckligen: det är vad enheten gör utan inställning
    if (v === field.meta.defaultValue && !field.inherited) field.onClear();
    else field.onChange(v);
  };
  return (
    <section className="@container flex flex-col gap-3 rounded-xl border border-[#d9dde2] bg-white px-5 py-[18px]">
      <div>
        <h3 className="text-[17px] font-extrabold text-kth-navy">{android ? "Börja med" : "Datortyp"}</h3>
        <p className="mt-[3px] text-[13px] text-[#5a6270]">
          {android ? "Vad enheten är till för. Bara inställningarna för det valda läget visas." : "Vad datorn är till för. Bara inställningarna för den valda typen visas."}
        </p>
      </div>
      <div className={`grid gap-2.5 ${options.length >= 4 ? "@2xl:grid-cols-2 @4xl:grid-cols-4" : "@2xl:grid-cols-3"}`} role="group" aria-label={android ? "Börja med" : "Datortyp"}>
        {options.map((v) => {
          const on = current === v;
          const card = cards[v] ?? { title: field.meta.options.find((o) => o.value === v)?.label ?? v, text: "" };
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => pick(v)}
              className={`flex min-h-[92px] flex-col items-start gap-1 rounded-xl border-2 px-4 py-3.5 text-left ${on ? "border-kth-blue bg-[#f4f8fd]" : "border-[#e0e4e9] bg-white hover:border-field"}`}
            >
              <span className="text-[15px] font-extrabold text-kth-navy">{card.title}</span>
              <span className="text-[12.5px] leading-[1.35] text-[#5a6270]">{card.text}</span>
            </button>
          );
        })}
      </div>
      {field.problem && <p className="text-[12.5px] font-semibold text-bad-ink">{field.problem}</p>}
      {footer}
    </section>
  );
}
