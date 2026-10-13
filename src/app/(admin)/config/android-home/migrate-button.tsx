"use client";

import { useActionState } from "react";
import { migrateAndroidHomeAction, type MigrationState } from "./actions";

export function MigrateButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<MigrationState, FormData>(migrateAndroidHomeAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={disabled || pending}
        className="h-10 self-start rounded-lg bg-kth-blue px-4 text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? "Flyttar…" : "Flytta startsidan in som första tjänst"}
      </button>
      {state && (
        <p role="alert" className={`text-[13px] font-semibold ${state.ok ? "text-ok-ink" : "text-bad-ink"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
