import type { HeatCell } from "@/lib/stats";

const DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const FIRST_HOUR = 7;
const LAST_HOUR = 21; // the 21–22 hour is the last column

function fmt(n: number) {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 1, minimumFractionDigits: n > 0 && n < 10 ? 1 : 0 });
}

/**
 * Weekday × hour, coloured by how many devices are in use on average. Hours outside 07–22 are
 * added to the grid only if something happened then. single: one device, shown as the share of
 * the hour it was in use (0.4 → 40).
 */
export function Heatmap({ cells, devices, single = false }: { cells: HeatCell[]; devices: number; single?: boolean }) {
  const value = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.inUse]));
  const used = cells.filter((c) => c.inUse > 0.01).map((c) => c.hour);
  const first = Math.min(FIRST_HOUR, ...used);
  const last = Math.max(LAST_HOUR, ...used);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(0.0001, ...cells.map((c) => c.inUse));

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-[11.5px]">
          <caption className="sr-only">
            {single
              ? "Andel av timmen som enheten i snitt används, i procent, per veckodag och timme"
              : `Genomsnittligt antal enheter i användning per veckodag och timme${devices ? `, av ${devices}` : ""}`}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-10" />
              {hours.map((h) => (
                <th key={h} scope="col" className="font-semibold text-faint">
                  {String(h).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, i) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-left font-semibold text-muted">
                  {day}
                </th>
                {hours.map((h) => {
                  const v = value.get(`${i + 1}-${h}`) ?? 0;
                  const alpha = v > 0 ? 0.08 + 0.92 * (v / max) : 0;
                  const when = `${day} ${String(h).padStart(2, "0")}–${String(h + 1).padStart(2, "0")}`;
                  const label = single
                    ? `${when}: används i snitt ${Math.round(v * 100)} % av timmen`
                    : `${when}: i snitt ${fmt(v)} ${devices ? `av ${devices} ` : ""}i användning`;
                  const text = single ? (v >= 0.005 ? String(Math.round(v * 100)) : "") : v >= 0.05 ? fmt(v) : "";
                  return (
                    <td
                      key={h}
                      title={label}
                      aria-label={label}
                      className={`h-8 min-w-8 rounded-[5px] text-center font-semibold tabular-nums ${alpha > 0.55 ? "text-white" : "text-select-ink"}`}
                      style={{ background: alpha ? `rgba(0, 71, 145, ${alpha.toFixed(3)})` : "var(--color-page)" }}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px] text-muted" aria-hidden="true">
        <span>Färre</span>
        <span className="h-2.5 w-28 rounded-full bg-gradient-to-r from-[rgba(0,71,145,0.08)] to-kth-blue" />
        <span>Fler i användning</span>
      </div>
    </div>
  );
}
