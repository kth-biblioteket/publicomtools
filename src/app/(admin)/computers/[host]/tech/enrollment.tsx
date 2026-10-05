"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newEnrollCodeAction, requestPinUnlockAction } from "../actions";

/**
 * Android: enrollment status and "Skapa inskrivningskod". The code is shown once, here; only its
 * hash is stored. A new code revokes the device's token until it is enrolled again.
 */
export function Enrollment({
  host,
  enrolledAt,
  codeExpiresAt,
  recoveryCode,
  unlockRequestedAt,
}: {
  host: string;
  enrolledAt: string | null;
  codeExpiresAt: string | null;
  /** Unlocks the settings menu on the device without network (forgotten PIN) */
  recoveryCode: string | null;
  /** "Lås upp menyn" is waiting for the next status report */
  unlockRequestedAt: string | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      setError(null);
      const res = await newEnrollCodeAction(host);
      if (!res.ok) return setError(res.error);
      setConfirm(false);
      setCode({ code: res.code, expiresAt: res.expiresAt });
      router.refresh();
    });

  const time = (iso: string) =>
    new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

  return (
    <section className="min-w-0 rounded-xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6">
      <h2 className="text-base font-extrabold">Inskrivning</h2>
      <p className="mt-1 text-sm text-muted">
        {enrolledAt
          ? `Enheten är inskriven sedan ${time(enrolledAt)} och har en egen nyckel.`
          : codeExpiresAt
            ? `En kod väntar på att användas, giltig till ${time(codeExpiresAt)}.`
            : "Enheten är inte inskriven än."}
      </p>

      {code ? (
        <div className="mt-3 flex flex-col gap-2 rounded-[10px] bg-[#eef6ff] px-4 py-3.5">
          <span className="text-sm">Ange koden i appen på enheten: menyn (5 tryck nere till höger) → Anslut till publicomtools.</span>
          <span className="font-mono text-[28px] font-extrabold tracking-[0.15em]">{code.code}</span>
          <span className="text-[13px] text-muted">
            Gäller en gång, till {time(code.expiresAt)}. Koden visas bara nu.
          </span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {enrolledAt && !confirm ? (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold hover:border-kth-blue"
            >
              Skriv in igen…
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white hover:bg-select-ink disabled:opacity-60"
            >
              {pending ? "Skapar…" : enrolledAt ? "Ja, skapa ny kod" : codeExpiresAt ? "Skapa ny kod" : "Skapa inskrivningskod"}
            </button>
          )}
          {confirm && (
            <span className="text-[13px] text-muted">
              Enhetens nuvarande nyckel slutar gälla direkt. Den får inga nya inställningar förrän den skrivits in med den nya koden.{" "}
              <button type="button" onClick={() => setConfirm(false)} className="font-semibold text-kth-blue underline">
                Avbryt
              </button>
            </span>
          )}
        </div>
      )}
      {enrolledAt && (
        <div className="mt-5 border-t border-line-soft pt-4">
          <h3 className="text-[15px] font-extrabold">Menyn på enheten</h3>
          <p className="mt-1 text-sm text-muted">
            Efter 5 fel PIN spärras menyn en stund (högst 15 minuter). <b>Lås upp menyn</b> tar bort spärren vid nästa
            statusrapport. Har ni glömt PIN:en: välj <i>Glömt PIN?</i> på enheten och ange återställningskoden, sedan väljer
            ni en ny PIN. Det fungerar även utan nät.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {unlockRequestedAt ? (
              <span className="text-[13px] text-muted">Upplåsning begärd {time(unlockRequestedAt)}.</span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await requestPinUnlockAction(host);
                    if (!res.ok) return setError(res.error);
                    router.refresh();
                  })
                }
                className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold hover:border-kth-blue disabled:opacity-60"
              >
                Lås upp menyn
              </button>
            )}
            {recoveryCode && (
              <span className="text-sm">
                Återställningskod: <span className="font-mono text-[15px] font-bold tracking-wider">{recoveryCode}</span>
              </span>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-ink">{error}</p>}
    </section>
  );
}
