"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameComputerAction } from "./actions";

/** Heading with "Byt namn i listan". The panel name on the computer is COMPUTER_NAME under Inställningar. */
export function RenameComputer({ host, name, label, panelName }: { host: string; name: string; label: string | null; panelName: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await renameComputerAction(host, value);
      if (!res.ok) return setError(res.error);
      setError(null);
      setEditing(false);
      router.refresh();
    });

  if (!editing)
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[26px] font-extrabold tracking-tight">{name}</h1>
        <button type="button" onClick={() => { setValue(label ?? ""); setEditing(true); }} className="text-[13px] font-semibold text-kth-blue underline underline-offset-2">
          Byt namn i listan
        </button>
      </div>
    );

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4"
    >
      <label htmlFor="computer-label" className="text-[13.5px] font-bold">Namn i admin</label>
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          id="computer-label"
          autoFocus
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          placeholder={panelName || host}
          className="h-[38px] w-full max-w-sm rounded-lg border border-field px-3 text-sm"
        />
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
          {pending ? "Sparar…" : "Spara"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">
          Avbryt
        </button>
      </div>
      <p className="text-[12.5px] text-muted">
        Visas bara i admin och gäller direkt. Tomt = datorns eget namn ({panelName || host}). Namnet i datorns panel ändras under
        Inställningar → Visningsnamn och gäller efter omstart.
      </p>
      {error && <p role="alert" className="text-sm font-semibold text-bad-ink">{error}</p>}
    </form>
  );
}
