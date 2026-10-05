"use client";

import { useActionState, useState } from "react";
import { createProfileAction } from "@/app/(admin)/config/profile-actions";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/platforms";

function slug(label: string) {
  return label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** "Ny profil": name, optional copy of an existing profile. */
export function NewProfile({ profiles }: { profiles: { name: string; label: string; platform: Platform }[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [platform, setPlatform] = useState<Platform>("linux");
  const [state, action, pending] = useActionState(createProfileAction, undefined);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white hover:bg-select-ink">
        <span aria-hidden="true" className="text-lg leading-none">+</span> Ny profil
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(20,24,32,.45)] px-4 pt-[12vh]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <form action={action} role="dialog" aria-modal="true" aria-labelledby="np-h" className="flex w-full max-w-[560px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="np-h" className="text-xl font-extrabold">Ny profil</h2>
            <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
              För
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
                Namn
                <input name="label" required autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="t.ex. Utställningsskärm" className="h-[38px] rounded-lg border border-field px-3 text-sm font-normal" />
              </label>
              <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
                Börja från
                <select key={platform} name="copyFrom" className="h-[38px] rounded-lg border border-field bg-white px-2.5 text-sm font-normal">
                  <option value="">Tom profil</option>
                  {profiles.filter((p) => p.platform === platform).map((p) => <option key={p.name} value={p.name}>Kopia av {p.label}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
              <span>Beskrivning <span className="font-medium text-muted">(frivillig)</span></span>
              <input name="description" maxLength={200} className="h-[38px] rounded-lg border border-field px-3 text-sm font-normal" />
            </label>
            <p className="text-[13px] text-muted">
              Kortnamn: <span className="font-mono">{slug(label) || "…"}</span>. Datorerna använder det, och det kan inte ändras senare.
            </p>
            {state?.error && <p role="alert" className="text-sm font-semibold text-bad-ink">{state.error}</p>}
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Avbryt</button>
              <button type="submit" disabled={pending || !slug(label)} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">
                {pending ? "Skapar…" : "Skapa profil"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
