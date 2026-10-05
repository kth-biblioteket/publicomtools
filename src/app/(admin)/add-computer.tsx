"use client";

import { useActionState, useState } from "react";
import { addComputerAction } from "./computer-actions";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/platforms";

/** "Lägg till dator": prepare a computer or Android tablet in the admin before installing it. */
export function AddComputer({ profiles }: { profiles: { name: string; label: string; platform: Platform }[] }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("linux");
  const own = profiles.filter((p) => p.platform === platform);
  const android = platform === "android";
  const [state, action, pending] = useActionState(addComputerAction, undefined);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white hover:bg-select-ink">
        <span aria-hidden="true" className="text-lg leading-none">+</span> Lägg till dator
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(20,24,32,.45)] px-4 pt-[12vh]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <form action={action} role="dialog" aria-modal="true" aria-labelledby="add-h" className="flex w-full max-w-[560px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h2 id="add-h" className="text-xl font-extrabold">Lägg till dator</h2>
              <p className="mt-1 text-sm text-muted">
                {android
                  ? "Förbered enheten här. Sedan skapar du en inskrivningskod, som du anger i appen på enheten."
                  : "Förbered datorn här innan den installeras. Den hämtar sina inställningar härifrån vid första starten."}
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
              Sort
              <select
                name="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="h-[38px] rounded-lg border border-field bg-white px-2.5 text-sm font-normal"
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </label>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
                Värdnamn
                <input
                  name="host"
                  required
                  autoFocus
                  pattern="[a-z0-9][a-z0-9-]{0,62}"
                  placeholder={android ? "t.ex. kiosk1" : "t.ex. gc4"}
                  autoComplete="off"
                  className="h-[38px] rounded-lg border border-field px-3 font-mono text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
                Profil
                <select key={platform} name="profile" defaultValue={own[0]?.name ?? ""} className="h-[38px] rounded-lg border border-field bg-white px-2.5 text-sm font-normal">
                  {own.map((p) => <option key={p.name} value={p.name}>{p.label}</option>)}
                  <option value="">Ingen profil</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
              <span>Namn i admin <span className="font-medium text-muted">(frivilligt)</span></span>
              <input name="label" maxLength={80} placeholder="t.ex. Gästdator plan 3" className="h-[38px] rounded-lg border border-field px-3 text-sm font-normal" />
            </label>
            <p className="text-[13px] text-muted">
              {android
                ? "Värdnamnet är enhetens id här: små bokstäver, siffror och bindestreck. Det kan inte ändras senare. Efteråt kommer du till Teknik, där du skapar inskrivningskoden."
                : "Värdnamnet ska vara samma som datorns namn i Ubuntu: små bokstäver, siffror och bindestreck. Det kan inte ändras senare. Efteråt kommer du till datorns inställningar, där du ställer in det som skiljer den från profilen."}
            </p>
            {state?.error && <p role="alert" className="text-sm font-semibold text-bad-ink">{state.error}</p>}
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Avbryt</button>
              <button type="submit" disabled={pending} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">
                {pending ? "Lägger till…" : "Lägg till dator"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
