import { requireAdmin } from "@/lib/auth";
import { filterOptions, PERIODS, resolvePeriod, swedishDay } from "@/lib/stats";
import { StatsFilters } from "@/components/stats/stats-filters";
import { UsageView, visitLimit } from "@/components/stats/usage-view";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = { linux: "Datorer (Linux)", android: "Kiosker (Android)" };

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  await requireAdmin();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = resolvePeriod({ period: one(sp.period), from: one(sp.from), to: one(sp.to) });
  const pageQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  ).toString();
  const options = await filterOptions();
  const platform = options.platforms.includes(one(sp.platform) ?? "") ? one(sp.platform) : undefined;
  const profile = options.profiles.some((p) => p.value === one(sp.profile)) ? one(sp.profile) : undefined;
  const query = new URLSearchParams(
    Object.entries({ period: one(sp.period), from: one(sp.from), to: one(sp.to) }).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  const lastDay = swedishDay(new Date(new Date(`${period.to}T12:00:00Z`).getTime() - 24 * 3600 * 1000));

  return (
    <div className="flex max-w-[1180px] flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Statistik</h1>
        <p className="mt-1 text-sm text-muted">
          Hur datorerna och kioskerna används: {period.from} – {lastDay}, jämfört med perioden innan.
        </p>
      </div>
      <StatsFilters
        periods={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        period={period.id}
        from={period.from}
        to={lastDay}
        platforms={options.platforms.map((p) => ({ value: p, label: PLATFORM_LABELS[p] ?? p }))}
        profiles={options.profiles}
      />
      <UsageView
        period={period}
        filter={{ platform, profile }}
        query={query}
        showDevices
        profileLabels={options.labels}
        visits={visitLimit(one(sp.antal))}
        pageQuery={pageQuery}
      />
    </div>
  );
}
