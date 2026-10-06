import Link from "next/link";
import type { VisitRow } from "@/lib/stats";
import { formatDuration } from "@/lib/status";

/** Why the visit ended, as the devices report it */
const REASONS: Record<string, string> = {
  idle: "Gick därifrån",
  home: "Tryckte på Hem",
  logout: "Loggade ut",
  timeout: "Tiden tog slut",
  config: "Nya inställningar",
  reboot: "Omstart",
  crash: "Appen startade om",
  end: "Sessionen avslutades",
};

const TZ = "Europe/Stockholm";
const WEEKDAYS = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "tis 6 okt", i svensk tid */
function day(d: Date) {
  const [y, m, dd] = d.toLocaleDateString("sv-SE", { timeZone: TZ }).split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]} ${dd} ${MONTHS[m - 1]}`;
}
const clock = (d: Date) => d.toLocaleTimeString("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/**
 * Every visit of the period, newest first. "Visa fler" raises ?antal= in the address, so the list
 * stays with the page's filters and can be shared.
 */
export function VisitList({
  visits,
  total,
  showDevice,
  moreHref,
}: {
  visits: VisitRow[];
  total: number;
  showDevice: boolean;
  /** Link that shows more, or null when all are shown */
  moreHref: string | null;
}) {
  if (visits.length === 0) return <p className="text-sm text-muted">Inga besök under perioden.</p>;
  // Bara kioskerna (Android) räknar sidor
  const showPages = visits.some((v) => v.pages !== null);
  return (
    <div>
      {/* Mobil: en rad per besök */}
      <ul className="flex flex-col divide-y divide-line md:hidden">
        {visits.map((v) => (
          <li key={v.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[13.5px]">
            <span className="min-w-0">
              <span className="block font-semibold">
                {day(v.startedAt)} {clock(v.startedAt)}–{clock(v.endedAt)}
              </span>
              <span className="block truncate text-[12.5px] text-muted">
                {showDevice && `${v.name} · `}
                {(v.reason && REASONS[v.reason]) ?? v.reason ?? "–"}
                {v.pages !== null && ` · ${v.pages} ${v.pages === 1 ? "sida" : "sidor"}`}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatDuration(v.seconds)}</span>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[12px] font-semibold text-muted">
            <tr className="border-b border-line">
              {showDevice && <th scope="col" className="py-2 pr-3">Enhet</th>}
              <th scope="col" className="py-2 pr-3">Dag</th>
              <th scope="col" className="py-2 pr-3">Tid</th>
              <th scope="col" className="py-2 pr-3 text-right">Längd</th>
              <th scope="col" className="py-2 pr-3">Slutade</th>
              {showPages && <th scope="col" className="py-2 text-right">Sidor</th>}
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id} className="border-b border-line-soft last:border-0">
                {showDevice && (
                  <td className="py-2 pr-3">
                    <Link href={`/computers/${v.host}/usage`} className="font-semibold text-kth-blue">{v.name}</Link>
                  </td>
                )}
                <td className="py-2 pr-3">{day(v.startedAt)}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {clock(v.startedAt)}–{clock(v.endedAt)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatDuration(v.seconds)}</td>
                <td className="py-2 pr-3 text-muted">{(v.reason && REASONS[v.reason]) ?? v.reason ?? "–"}</td>
                {showPages && <td className="py-2 text-right tabular-nums text-muted">{v.pages ?? "–"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span>
          Visar {visits.length.toLocaleString("sv-SE")} av {total.toLocaleString("sv-SE")}
        </span>
        {moreHref && (
          <Link href={moreHref} scroll={false} className="font-semibold text-kth-blue">
            Visa fler
          </Link>
        )}
      </div>
    </div>
  );
}
