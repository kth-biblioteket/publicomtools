"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestScreenshotAction } from "./actions";

/**
 * Android: what the tablet shows. "Ta skärmdump" reaches it with its next status report, and the
 * tablet takes the picture when nobody has touched it for 2 minutes (by then the app is back on its
 * start page with a new session), so no visitor's input is in it. The page refreshes itself, so the
 * picture appears when it has arrived.
 */
export function ScreenshotCard({
  host,
  src,
  takenAt,
  requestedAt,
  within,
}: {
  host: string;
  /** URL of the image (built on the server, with the base path) */
  src: string | null;
  /** "kl 14.05", or null if there is none */
  takenAt: string | null;
  /** "kl 14.07" while a request is waiting */
  requestedAt: string | null;
  within: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="min-w-0 rounded-xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">Skärmen</h2>
        {requestedAt ? (
          <span className="text-[13px] text-muted">
            Skärmdump begärd {requestedAt}. Den tas när ingen har rört skärmen på 2 minuter och kommer sedan {within}.
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await requestScreenshotAction(host);
                if (!res.ok) return setError(res.error);
                router.refresh();
              })
            }
            className="h-[30px] rounded-md border border-[#d7dbe0] bg-white px-3 text-[13px] font-semibold hover:border-kth-blue disabled:opacity-60"
          >
            {pending ? "Begär…" : "Ta skärmdump"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-bad-ink">{error}</p>}
      {src && takenAt ? (
        <figure className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-only image from a route handler */}
          <img
            src={src}
            alt="Enhetens skärm"
            className="max-h-[480px] w-auto max-w-full rounded-lg border border-line"
          />
          <figcaption className="mt-1.5 text-[13px] text-muted">Tagen {takenAt}, när ingen använde enheten. Visar bara appen, inget annat på enheten.</figcaption>
        </figure>
      ) : (
        <p className="mt-2 text-sm text-muted">Ingen skärmdump än.</p>
      )}
    </section>
  );
}
