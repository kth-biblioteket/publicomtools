"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newEnrollCodeAction } from "../actions";

/**
 * Android: enrollment status and "Skapa inskrivningskod". The code is shown once, here; only its
 * hash is stored. A new code revokes the device's token until it is enrolled again.
 */
export function Enrollment({
  host,
  enrolledAt,
  codeExpiresAt,
}: {
  host: string;
  enrolledAt: string | null;
  codeExpiresAt: string | null;
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
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-ink">{error}</p>}
    </section>
  );
}
