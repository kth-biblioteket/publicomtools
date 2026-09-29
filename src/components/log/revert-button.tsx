"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revertAction, revertPreviewAction } from "@/app/(admin)/log-actions";

type Line = { key: string; label: string; becomes: string };

/** "Ångra den här ändringen…" with a confirm dialog that warns about later edits of the same keys. */
export function RevertButton({ id, title, lines }: { id: string; title: string; lines: Line[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const openDialog = () => {
    setOpen(true);
    setError(null);
    setConflicts(null);
    start(async () => {
      const res = await revertPreviewAction(id);
      if ("error" in res) setError(res.error);
      else setConflicts(res.conflicts);
    });
  };
  const confirm = () =>
    start(async () => {
      const res = await revertAction(id);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setDone(true);
      router.refresh();
    });

  const conflictLabels = lines.filter((l) => conflicts?.includes(l.key)).map((l) => l.label);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#d7dbe0] bg-white px-3 text-[13px] font-semibold hover:border-kth-blue"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        </svg>
        Ångra ändringen…
      </button>
      {done && <span role="status" className="ml-2 text-[13px] font-semibold text-ok-ink">Ändringen är ångrad.</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(20,24,32,.45)] px-4 pt-[12vh]" onKeyDown={(e) => e.key === "Escape" && !pending && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby={`rv-${id}`} className="flex w-full max-w-[520px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h2 id={`rv-${id}`} className="text-xl font-extrabold">Ångra ändringen?</h2>
              <p className="mt-1 text-sm text-muted">{title}</p>
            </div>
            {lines.map((l) => (
              <div key={l.key} className="rounded-[10px] border border-line-soft px-3.5 py-3 text-sm">
                <b>{l.label}</b> blir <b>{l.becomes}</b> igen.
              </div>
            ))}
            {conflictLabels.length > 0 && (
              <div className="rounded-[10px] bg-warn-bg px-3 py-2.5 text-[13.5px] text-warn-ink">
                {conflictLabels.join(", ")} har ändrats igen efter det här. Det senare värdet skrivs över.
              </div>
            )}
            <p className="text-[13px] text-muted">Ångringen sparas som en ny ändring i loggen.</p>
            {error && <p role="alert" className="text-sm font-semibold text-bad-ink">{error}</p>}
            <div className="flex justify-end gap-2.5">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">
                Avbryt
              </button>
              <button
                type="button"
                disabled={pending || conflicts === null}
                onClick={confirm}
                className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
              >
                {pending && conflicts !== null ? "Ångrar…" : "Ångra ändringen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
