"use client";

import { useActionState, useState } from "react";
import { deleteProfileAction, updateProfileAction } from "@/app/(admin)/config/profile-actions";

/** Rename (display name only) and delete, on the profile page. */
export function ProfileMeta({ name, label, description, used }: { name: string; label: string; description: string | null; used: number }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, action, pending] = useActionState(updateProfileAction.bind(null, name), undefined);
  const [delState, delAction, deleting] = useActionState(deleteProfileAction.bind(null, name), undefined);

  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-kth-blue underline underline-offset-2">Byt namn eller beskrivning</button>
        {used === 0 &&
          (confirmDelete ? (
            <form action={delAction} className="flex items-center gap-2">
              <span className="font-semibold text-bad-ink">Ta bort profilen?</span>
              <button type="submit" disabled={deleting} className="h-8 rounded-lg bg-bad-ink px-3 font-semibold text-white">Ta bort</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-8 rounded-lg border border-[#d7dbe0] px-3 font-semibold">Avbryt</button>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="font-semibold text-bad-ink underline underline-offset-2">Ta bort profilen</button>
          ))}
        {used > 0 && <span className="text-muted">Profilen kan tas bort när ingen dator använder den.</span>}
        {delState?.error && <span role="alert" className="font-semibold text-bad-ink">{delState.error}</span>}
      </div>
    );

  return (
    <form action={async (f) => { await action(f); setEditing(false); }} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
      <label className="flex flex-col gap-1 text-[13px] font-bold">
        Namn
        <input name="label" defaultValue={label} required className="h-9 w-56 rounded-lg border border-field px-3 text-sm font-normal" />
      </label>
      <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-[13px] font-bold">
        Beskrivning
        <input name="description" defaultValue={description ?? ""} className="h-9 rounded-lg border border-field px-3 text-sm font-normal" />
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white">Spara</button>
      <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">Avbryt</button>
      {state?.error && <p role="alert" className="w-full text-sm font-semibold text-bad-ink">{state.error}</p>}
      <p className="w-full text-[12.5px] text-muted">Kortnamnet <span className="font-mono">{name}</span> ändras inte, datorerna använder det.</p>
    </form>
  );
}
