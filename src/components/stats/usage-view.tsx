import Link from "next/link";
import {
  durations,
  DURATION_BUCKETS,
  firstVisitAt,
  heatmap,
  perDay,
  perDevice,
  previousPeriod,
  summary,
  type Period,
  type StatsFilter,
  type Summary,
} from "@/lib/stats";
import { formatDuration } from "@/lib/status";
import { Chip } from "@/components/ui/chip";
import { BarChart, type Bar } from "./bar-chart";
import { Heatmap } from "./heatmap";
import { Sparkline } from "./sparkline";
import { StatCard, StatPanel } from "./stat-card";

const num = (n: number) => n.toLocaleString("sv-SE");
const pct = (n: number) => `${Math.round(n * 100)} %`;
/** Användningstid i timmar, som är lättare att jämföra än dagar: "44 h", "5 h 37 min", "12 min" */
function hours(seconds: number): string {
  if (seconds < 3600) return formatDuration(seconds);
  const h = Math.floor(seconds / 3600);
  return h >= 10 ? `${num(h)} h` : `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
}
const WEEKDAYS = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function relative(now: number, before: number): { text: string; up: boolean } | null {
  if (before <= 0 || now === before) return null;
  const change = (now - before) / before;
  return { text: `${Math.abs(Math.round(change * 100))} %`, up: change > 0 };
}

function points(now: number | null, before: number | null): { text: string; up: boolean } | null {
  if (now === null || before === null) return null;
  const diff = Math.round((now - before) * 100);
  return diff === 0 ? null : { text: `${Math.abs(diff)} procentenheter`, up: diff > 0 };
}

function dayBars(rows: { day: string; visits: number }[]): Bar[] {
  return rows.map((r, i) => {
    const d = new Date(`${r.day}T12:00:00Z`);
    const dow = d.getUTCDay();
    const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    let tick: string | undefined;
    if (rows.length <= 14) tick = `${WEEKDAYS[dow]} ${d.getUTCDate()}`;
    else if (rows.length <= 62) tick = dow === 1 || i === 0 ? date : "";
    else tick = d.getUTCDate() === 1 || i === 0 ? MONTHS[d.getUTCMonth()] : "";
    return {
      label: `${WEEKDAYS[dow]} ${date}`,
      value: r.visits,
      title: `${WEEKDAYS[dow]} ${date}: ${num(r.visits)} besök`,
      tick,
      muted: dow === 0 || dow === 6,
    };
  });
}

/**
 * The statistics for a period: key figures, when, how many, how long, and (for several devices)
 * which are used least. Used by /stats and by each computer's Användning tab.
 */
export async function UsageView({
  period,
  filter,
  query,
  showDevices,
  profileLabels,
}: {
  period: Period;
  filter: StatsFilter;
  /** The current ?… so links to a computer keep the period */
  query: string;
  showDevices: boolean;
  profileLabels: Map<string, string>;
}) {
  const before = previousPeriod(period);
  const [now, prev, cells, days, lengths, devices, first] = await Promise.all([
    summary(period, filter),
    summary(before, filter),
    heatmap(period, filter),
    perDay(period, filter),
    durations(period, filter),
    showDevices ? perDevice(period, filter) : Promise.resolve([]),
    firstVisitAt(),
  ]);

  if (!first) {
    return (
      <div className="rounded-xl border border-dashed border-field bg-white px-6 py-10 text-center">
        <p className="text-base font-bold">Ingen statistik än</p>
        <p className="mx-auto mt-1 max-w-[520px] text-sm text-muted">
          Statistiken börjar samlas in när datorerna och kioskerna har uppdaterats till en version som rapporterar
          besök. Den räknas inte bakåt.
        </p>
      </div>
    );
  }

  const dayCount = days.length;
  const startedNote =
    first > new Date(`${period.from}T00:00:00Z`)
      ? `Besök rapporteras sedan ${first.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}.`
      : null;

  return (
    <div className="flex flex-col gap-4">
      {startedNote && <p className="text-[13px] text-muted">{startedNote}</p>}
      <KeyFigures now={now} prev={prev} dayCount={dayCount} />

      <StatPanel
        title="När används de?"
        hint={
          filter.host
            ? "Hur stor del av varje timme enheten i snitt används, i procent. Mörkare = mer använd."
            : "Hur många enheter som i snitt används per veckodag och timme. Mörkare = mer använd."
        }
      >
        <Heatmap cells={cells} devices={filter.host ? 0 : now.devices} single={!!filter.host} />
      </StatPanel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[3fr_2fr]">
        <StatPanel title="Besök per dag" hint="Lördag och söndag i ljusare blått.">
          <BarChart bars={dayBars(days)} caption="Besök per dag" />
        </StatPanel>
        <StatPanel title="Hur långa är besöken?" hint={`Typiskt besök (median): ${formatDuration(now.medianSeconds)}.`}>
          <BarChart
            caption="Antal besök per längd"
            bars={DURATION_BUCKETS.map((b, i) => ({
              label: b.label,
              value: lengths[i],
              title: `${b.label}: ${num(lengths[i])} besök`,
            }))}
          />
        </StatPanel>
      </div>

      {showDevices && devices.length > 0 && (
        <StatPanel
          title="Per enhet"
          hint="Minst använda först. Beläggning = hur stor del av tiden enheten var igång som någon använde den."
        >
          <DeviceTable devices={devices} query={query} profileLabels={profileLabels} />
        </StatPanel>
      )}
    </div>
  );
}

function KeyFigures({ now, prev, dayCount }: { now: Summary; prev: Summary; dayCount: number }) {
  const compare = prev.onlineSeconds > 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Besök"
        value={num(now.visits)}
        sub={`≈ ${num(Math.round(now.visits / Math.max(1, dayCount)))} per dag`}
        change={compare ? relative(now.visits, prev.visits) : null}
      />
      <StatCard
        label="Användningstid"
        value={hours(now.usedSeconds)}
        change={compare ? relative(now.usedSeconds, prev.usedSeconds) : null}
      />
      <StatCard
        label="Typiskt besök"
        value={formatDuration(now.medianSeconds)}
        sub="median"
        change={compare ? relative(now.medianSeconds, prev.medianSeconds) : null}
      />
      <StatCard
        label="Beläggning"
        value={now.occupancy === null ? "–" : pct(now.occupancy)}
        sub="av tiden igång"
        change={compare ? points(now.occupancy, prev.occupancy) : null}
      />
    </div>
  );
}

function OccupancyBar({ value }: { value: number | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-page" aria-hidden="true">
        <span className="block h-full rounded-full bg-kth-blue" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </span>
      <span className="tabular-nums">{value === null ? "–" : pct(value)}</span>
    </span>
  );
}

function DeviceTable({
  devices,
  query,
  profileLabels,
}: {
  devices: Awaited<ReturnType<typeof perDevice>>;
  query: string;
  profileLabels: Map<string, string>;
}) {
  const href = (host: string) => `/computers/${host}/usage${query ? `?${query}` : ""}`;
  const profile = (p: string | null) => (p ? (profileLabels.get(p) ?? p) : "Ingen profil");
  return (
    <>
      {/* Mobil: ett kort per enhet */}
      <ul className="flex flex-col divide-y divide-line md:hidden">
        {devices.map((d) => (
          <li key={d.host} className="py-3">
            <Link href={href(d.host)} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-kth-blue">{d.name}</span>
                <span className="block text-[12.5px] text-muted">
                  {profile(d.profile)} · {num(d.visits)} besök · {hours(d.usedSeconds)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-[13px]">
                <OccupancyBar value={d.occupancy} />
                {d.littleData && <Chip tone="draft">Lite data</Chip>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Bredare: tabell */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[12px] font-semibold text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Enhet</th>
              <th scope="col" className="py-2 pr-3">Profil</th>
              <th scope="col" className="py-2 pr-3 text-right">Besök</th>
              <th scope="col" className="py-2 pr-3 text-right">Användning</th>
              <th scope="col" className="py-2 pr-3">Beläggning</th>
              <th scope="col" className="py-2 pr-3">Besök per dag</th>
              <th scope="col" className="py-2 text-right">Igång</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.host} className="border-b border-line-soft last:border-0">
                <td className="py-2.5 pr-3">
                  <Link href={href(d.host)} className="font-semibold text-kth-blue">{d.name}</Link>
                  {d.platform === "android" && <span className="ml-1.5 text-[12px] text-muted">Android</span>}
                </td>
                <td className="py-2.5 pr-3 text-muted">{profile(d.profile)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{num(d.visits)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{hours(d.usedSeconds)}</td>
                <td className="py-2.5 pr-3">
                  <OccupancyBar value={d.occupancy} />
                </td>
                <td className="py-2.5 pr-3">
                  <Sparkline values={d.daily} label={`Besök per dag för ${d.name}`} />
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted">
                  {d.littleData ? (
                    <Chip tone="draft" title="Igång mindre än halva perioden: siffrorna säger lite">
                      {hours(d.onlineSeconds)}
                    </Chip>
                  ) : (
                    hours(d.onlineSeconds)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
