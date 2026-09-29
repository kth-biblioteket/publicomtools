"use client";

import { useState } from "react";
import { deleteComputer } from "@/app/actions";

/** "Ta bort" behind a dialog where the host name must be typed. */
export function DeleteComputer({ host, name }: { host: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-xl border border-[#e3b3bc] bg-white px-6 py-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-extrabold text-bad-ink">Ta bort datorn</h2>
        <p className="mt-1 max-w-[620px] text-[13.5px] text-muted">
          Tar bort datorn, dess egna inställningar och all status. Om den fortfarande är igång dyker den upp igen vid nästa
          statusrapport, men utan egna inställningar.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-lg border border-[#e3b3bc] bg-white px-3.5 text-[13.5px] font-semibold text-bad-ink hover:bg-bad-bg"
      >
        Ta bort {name}…
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(20,24,32,.45)] px-4 pt-[15vh]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <form
            action={deleteComputer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-h"
            className="flex w-full max-w-[520px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h2 id="del-h" className="text-xl font-extrabold">Ta bort {name}?</h2>
              <p className="mt-1 text-sm text-muted">Egna inställningar och all status för datorn tas bort. Det går inte att ångra.</p>
            </div>
            <input type="hidden" name="host" value={host} />
            <label htmlFor="del-confirm" className="text-[13.5px] font-bold">
              Skriv <span className="rounded bg-[#eceef1] px-1.5 font-mono">{host}</span> för att bekräfta
            </label>
            <input
              id="del-confirm"
              autoFocus
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-[38px] rounded-lg border border-field px-3 text-sm"
            />
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">
                Avbryt
              </button>
              <button
                type="submit"
                disabled={typed.trim() !== host}
                className="h-9 rounded-lg bg-bad-ink px-3.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Ta bort datorn
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
