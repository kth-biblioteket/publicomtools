"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CatalogPreview } from "@/lib/catalog";
import { previewCatalogAction, updateCatalogAction } from "./actions";

const TAG = "inline-flex h-[22px] items-center rounded-md px-2 text-xs font-bold";

/** "Hämta från stable": show what would change, then apply. */
export function CatalogUpdate({ refLabel, keysInUse }: { refLabel: string; keysInUse: string[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fetchPreview = () =>
    start(async () => {
      setError(null);
      setDone(null);
      const res = await previewCatalogAction();
      if (!res.ok) return setError(res.error);
      setPreview(res.preview);
    });
  const apply = () =>
    start(async () => {
      if (!preview) return;
      const res = await updateCatalogAction(preview.version);
      if (!res.ok) return setError(res.error);
      setPreview(null);
      setDone(`Katalogen är uppdaterad: ${res.keys} inställningar.`);
      router.refresh();
    });

  const d = preview?.diff;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={fetchPreview} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold hover:border-kth-blue disabled:opacity-60">
          {pending && !preview ? "Hämtar…" : `Hämta från ${refLabel}`}
        </button>
        {done && <span role="status" className="text-sm font-semibold text-ok-ink">{done}</span>}
        {error && <span role="alert" className="text-sm font-semibold text-bad-ink">{error}</span>}
      </div>

      {preview && d && (
        <section className="flex flex-col gap-1 rounded-xl border border-[#f0d98a] bg-draft px-5 py-4">
          {preview.upToDate ? (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm">Katalogen är redan aktuell (version <span className="font-mono">{preview.version}</span>).</p>
              <button type="button" onClick={() => setPreview(null)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Stäng</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="text-base font-extrabold">
                    Ny version: <span className="font-mono text-sm">{preview.version}</span>
                  </div>
                  <div className="text-[13px] text-muted">
                    {d.added.length} nya, {d.changed.length} ändrade, {d.removed.length} borttagna · {preview.source}
                  </div>
                </div>
                <button type="button" onClick={() => setPreview(null)} disabled={pending} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Inte nu</button>
                <button type="button" onClick={apply} disabled={pending} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
                  {pending ? "Uppdaterar…" : "Uppdatera katalogen"}
                </button>
              </div>
              <ul className="mt-2 flex flex-col text-sm">
                {d.added.map((k) => (
                  <li key={k.key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3.5 border-t border-[#f0e6c8] py-2.5">
                    <span><span className={`${TAG} bg-ok-bg text-ok-ink`}>Ny</span></span>
                    <span><b>{k.label}</b> <span className="font-mono text-xs text-muted">{k.key}</span></span>
                  </li>
                ))}
                {d.changed.map(({ key: k, fields }) => (
                  <li key={k.key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3.5 border-t border-[#f0e6c8] py-2.5">
                    <span><span className={`${TAG} bg-select text-select-ink`}>Ändrad</span></span>
                    <span>
                      <b>{k.label}</b> <span className="font-mono text-xs text-muted">{k.key}</span>
                      <span className="block text-[13px] text-muted">Ändrat: {fields.join(", ")}</span>
                    </span>
                  </li>
                ))}
                {d.removed.map((k) => (
                  <li key={k.key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3.5 border-t border-[#f0e6c8] py-2.5">
                    <span><span className={`${TAG} bg-bad-bg text-bad-ink`}>Borttagen</span></span>
                    <span>
                      <b>{k.label}</b> <span className="font-mono text-xs text-muted">{k.key}</span>
                      {keysInUse.includes(k.key) && (
                        <span className="block text-[13px] text-warn-ink">
                          Har fortfarande värden. De ligger kvar men visas som ”Används inte längre” tills någon tar bort dem.
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
