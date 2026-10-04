"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestReloadAction } from "./actions";

/**
 * Shown while the computer has settings it hasn't fetched yet. The request reaches the
 * computer with its next status report (every 5 minutes, or HEARTBEAT_INTERVAL); it applies the settings when
 * nobody is using it.
 */
export function ReloadButton({ host, requestedAt, within }: { host: string; requestedAt: string | null; within: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (requestedAt)
    return (
      <span className="text-[13px] text-muted">
        Hämtning begärd kl {requestedAt}. Datorn gör det när ingen använder den.
      </span>
    );

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await requestReloadAction(host);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
        title={`Datorn får besked vid nästa statusrapport (${within}) och hämtar inställningarna när ingen använder den, utan omstart.`}
        className="h-[26px] rounded-md border border-[#d7dbe0] bg-white px-2.5 text-[12.5px] font-semibold text-ink hover:border-kth-blue disabled:opacity-60"
      >
        {pending ? "Begär…" : "Hämta nya inställningar nu"}
      </button>
      {error && <span role="alert" className="text-[12.5px] font-semibold text-bad-ink">{error}</span>}
    </span>
  );
}
