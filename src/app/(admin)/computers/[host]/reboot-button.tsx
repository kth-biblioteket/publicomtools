"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestRebootAction } from "./actions";

/**
 * "Starta om datorn". The request reaches the computer with its next status report (every
 * 5 minutes), and it reboots when nobody is using it.
 */
export function RebootButton({ host, name, requestedAt }: { host: string; name: string; requestedAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (requestedAt)
    return <span className="text-[13px] text-muted">Omstart begärd kl {requestedAt}. Datorn startar om när ingen använder den.</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="h-[26px] rounded-md border border-[#d7dbe0] bg-white px-2.5 text-[12.5px] font-semibold text-ink hover:border-kth-blue"
      >
        Starta om datorn…
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(20,24,32,.45)] px-4 pt-[15vh]"
          onKeyDown={(e) => e.key === "Escape" && !pending && setOpen(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="reboot-h" className="flex w-full max-w-[520px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="reboot-h" className="text-xl font-extrabold">Starta om {name}?</h2>
            <p className="text-sm leading-relaxed text-muted">
              Datorn får beskedet med nästa statusrapport, inom 5 minuter. Den startar om när ingen använder den: ingen
              inloggad och ingen aktivitet på 2 minuter, senast efter 8 timmar. Efter omstarten hämtar den sina inställningar
              och sin kod som vanligt.
            </p>
            {error && <p role="alert" className="text-sm font-semibold text-bad-ink">{error}</p>}
            <div className="flex justify-end gap-2.5">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">
                Avbryt
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await requestRebootAction(host);
                    if (!res.ok) return setError(res.error);
                    setOpen(false);
                    router.refresh();
                  })
                }
                className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Begär…" : "Starta om när den är ledig"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
