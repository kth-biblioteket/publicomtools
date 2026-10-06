"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Option = { value: string; label: string };

/**
 * Period, platform and profile. Everything is in the address, so a view can be shared and the
 * page is rendered on the server.
 */
export function StatsFilters({
  periods,
  period,
  from,
  to,
  platforms,
  profiles,
}: {
  periods: Option[];
  period: string;
  /** The chosen custom period (inclusive), shown in the date fields */
  from: string;
  to: string;
  platforms?: Option[];
  profiles?: Option[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState(period === "custom");

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.push(qs ? `${path}?${qs}` : path, { scroll: false });
  }

  const select =
    "h-[34px] rounded-lg border border-field bg-white px-2.5 text-[13px] font-semibold text-ink focus:outline-2 focus:outline-kth-blue";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Period" className="inline-flex flex-wrap gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]">
        {periods.map((p) => {
          const active = !custom && period === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCustom(false);
                go({ period: p.value === "30d" ? null : p.value, from: null, to: null });
              }}
              className={`inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-semibold ${
                active ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => setCustom(true)}
          className={`inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-semibold ${
            custom ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"
          }`}
        >
          Välj datum
        </button>
      </div>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-1.5 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            go({ period: null, from: String(data.get("from")), to: String(data.get("to")) });
          }}
        >
          <label className="sr-only" htmlFor="stats-from">Från</label>
          <input id="stats-from" name="from" type="date" defaultValue={from} required className={select} />
          <span className="text-muted">–</span>
          <label className="sr-only" htmlFor="stats-to">Till</label>
          <input id="stats-to" name="to" type="date" defaultValue={to} required className={select} />
          <button type="submit" className="h-[34px] rounded-lg bg-kth-blue px-3 font-semibold text-white">Visa</button>
        </form>
      )}
      {platforms && platforms.length > 1 && (
        <>
          <label className="sr-only" htmlFor="stats-platform">Plattform</label>
          <select
            id="stats-platform"
            className={select}
            value={params.get("platform") ?? ""}
            onChange={(e) => go({ platform: e.target.value || null })}
          >
            <option value="">Alla plattformar</option>
            {platforms.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )}
      {profiles && profiles.length > 0 && (
        <>
          <label className="sr-only" htmlFor="stats-profile">Profil</label>
          <select
            id="stats-profile"
            className={select}
            value={params.get("profile") ?? ""}
            onChange={(e) => go({ profile: e.target.value || null })}
          >
            <option value="">Alla profiler</option>
            {profiles.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
