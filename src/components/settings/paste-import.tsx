"use client";

import { useState } from "react";
import { formatValue, validateValue, type CatalogEntry } from "@/lib/settings-shared";

type Parsed =
  | { kind: "ok"; line: number; key: string; value: string }
  | { kind: "skip"; line: number }
  | { kind: "error"; line: number; message: string; suggestion?: { from: string; to: string } };

/** Edit distance, for "menade du SCREENSAVER_IDLE?" */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Same rules as the computers' load_config: KEY=value, one layer of quotes, # comments. */
function parse(text: string, meta: Map<string, CatalogEntry>): Parsed[] {
  return text.split("\n").map((raw, i) => {
    const line = i + 1;
    const s = raw.replace(/\r$/, "").trim();
    if (!s || s.startsWith("#")) return { kind: "skip", line };
    const eq = s.indexOf("=");
    if (eq < 1) return { kind: "error", line, message: "Raden ska se ut som NYCKEL=\"värde\"." };
    const key = s.slice(0, eq).trim();
    let value = s.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) || (value.startsWith("'") && value.endsWith("'") && value.length > 1))
      value = value.slice(1, -1);
    const m = meta.get(key);
    if (!m) {
      const best = [...meta.keys()].map((k) => [k, distance(key.toUpperCase(), k)] as const).sort((a, b) => a[1] - b[1])[0];
      return best && best[1] <= 3
        ? { kind: "error", line, message: `${key} finns inte. Menade du ${meta.get(best[0])!.label} (${best[0]})?`, suggestion: { from: key, to: best[0] } }
        : { kind: "error", line, message: `${key} finns inte i katalogen.` };
    }
    const problem = validateValue(m, value);
    return problem ? { kind: "error", line, message: `${m.label}: ${problem}` } : { kind: "ok", line, key, value };
  });
}

/** IT: paste lines in the old .env format; each line is checked before anything changes. */
export function PasteImport({
  catalog,
  current,
  onApply,
}: {
  catalog: CatalogEntry[];
  /** What the key is now in the editor (own, drafted or inherited) */
  current: (key: string) => string | null;
  onApply: (entries: { key: string; value: string }[]) => void;
}) {
  const meta = new Map(catalog.map((k) => [k.key, k]));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const results = parse(text, meta);
  const errors = results.filter((r) => r.kind === "error");
  const oks = results.filter((r): r is Extract<Parsed, { kind: "ok" }> => r.kind === "ok");

  const fix = (from: string, to: string) =>
    setText((t) => t.split("\n").map((l) => (l.trim().startsWith(`${from}=`) ? l.replace(from, to) : l)).join("\n"));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold hover:border-kth-blue">
        Klistra in rader…
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,24,32,.45)] px-4 py-[8vh]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="paste-h" className="grid w-full max-w-[1100px] gap-6 rounded-2xl bg-white p-6 shadow-2xl lg:grid-cols-2">
            <div className="flex flex-col gap-2.5">
              <h2 id="paste-h" className="text-xl font-extrabold">Klistra in inställningar</h2>
              <p className="text-sm text-muted">Samma format som de gamla .env-filerna. Varje rad kontrolleras innan något ändras.</p>
              <label htmlFor="paste-ta" className="sr-only">Inställningar som text</label>
              <textarea
                id="paste-ta"
                autoFocus
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder={'SCREENSAVER="false"\nSESSION_IDLE="10"'}
                className="w-full resize-y rounded-[10px] border border-field bg-[#f8f9fa] px-3.5 py-3 font-mono text-[12.5px] leading-7"
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="text-[15px] font-extrabold">Så här tolkas det</div>
              <div className="overflow-hidden rounded-[10px] border border-line">
                {results.every((r) => r.kind === "skip") && <p className="px-3 py-3 text-sm text-muted">Klistra in rader till vänster.</p>}
                {results.map((r) =>
                  r.kind === "skip" ? null : (
                    <div key={r.line} className="grid grid-cols-[28px_20px_minmax(0,1fr)] items-start gap-x-2 border-t border-line-soft px-3 py-2 text-[13.5px] first:border-0">
                      <span className="pt-0.5 font-mono text-xs text-faint">{r.line}</span>
                      <span aria-label={r.kind === "ok" ? "OK" : "Fel"} className={`font-bold ${r.kind === "ok" ? "text-ok-ink" : "text-bad-ink"}`}>
                        {r.kind === "ok" ? "✓" : "✕"}
                      </span>
                      {r.kind === "ok" ? (
                        <span className="break-words">
                          <b>{meta.get(r.key)!.label}</b>: {formatValue(meta.get(r.key), current(r.key))} → {formatValue(meta.get(r.key), r.value)}
                        </span>
                      ) : (
                        <span className="break-words">
                          {r.message}{" "}
                          {r.suggestion && (
                            <button type="button" onClick={() => fix(r.suggestion!.from, r.suggestion!.to)} className="font-bold text-kth-blue underline">
                              Rätta
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-end gap-2.5">
                {errors.length > 0 && (
                  <span className="mr-auto text-[13px] font-semibold text-bad-ink">
                    Rätta {errors.length} {errors.length === 1 ? "rad" : "rader"} för att fortsätta
                  </span>
                )}
                <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Avbryt</button>
                <button
                  type="button"
                  disabled={errors.length > 0 || oks.length === 0}
                  onClick={() => {
                    onApply(oks.map((o) => ({ key: o.key, value: o.value })));
                    setOpen(false);
                    setText("");
                  }}
                  className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-45"
                >
                  Lägg till som osparade ändringar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
