import { requireAdmin } from "@/lib/auth";
import { filterOptions, PERIODS, resolvePeriod, swedishDay } from "@/lib/stats";
import { StatsFilters } from "@/components/stats/stats-filters";
import { UsageView } from "@/components/stats/usage-view";

export const dynamic = "force-dynamic";

export default async function ComputerUsagePage({ params, searchParams }: PageProps<"/computers/[host]/usage">) {
  // Layouten renderas inte om vid klientnavigering mellan flikarna: varje sida kontrollerar själv
  await requireAdmin();
  const { host } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = resolvePeriod({ period: one(sp.period), from: one(sp.from), to: one(sp.to) });
  const options = await filterOptions();
  const lastDay = swedishDay(new Date(new Date(`${period.to}T12:00:00Z`).getTime() - 24 * 3600 * 1000));

  return (
    <div className="flex max-w-[1180px] flex-col gap-4">
      <StatsFilters
        periods={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        period={period.id}
        from={period.from}
        to={lastDay}
      />
      <UsageView period={period} filter={{ host }} query="" showDevices={false} profileLabels={options.labels} />
    </div>
  );
}
