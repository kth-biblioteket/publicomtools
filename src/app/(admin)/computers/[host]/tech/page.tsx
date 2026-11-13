import { requireAdmin } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getComputerView } from "@/lib/computers";
import { loadLayers, mergeLayers, type ConfigSource } from "@/lib/config";
import { heartbeatSchema } from "@/lib/heartbeat";
import { formatDuration, formatInterval, formatTime, heartbeatInterval } from "@/lib/status";
import { DeleteComputer } from "./delete-computer";
import { Enrollment } from "./enrollment";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 100;
// min-w-0: grid items otherwise grow to fit the history table and the config listing
const CARD = "min-w-0 rounded-xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6";

const SOURCE_LABEL: Record<ConfigSource, (profile: string | null) => string> = {
  base: () => "grundinställningar",
  profile: (p) => `profilen ${p}`,
  host: () => "satt här",
  auto: () => "automatiskt",
};

export default async function ComputerTechPage({ params }: PageProps<"/computers/[host]/tech">) {
  // Every page checks itself: the [host] layout is not re-rendered on client-side navigation.
  const { role } = await requireAdmin();
  const { host } = await params;
  const [c, row, layers] = await Promise.all([
    getComputerView(host),
    db.computer.findUnique({
      where: { host },
      select: { firstSeenAt: true, configUpdatedAt: true, recoveryCode: true, pinUnlockRequestedAt: true },
    }),
    loadLayers(host),
  ]);
  if (!c || !row || !layers) notFound();

  const s = c.status;
  const history = (await db.heartbeat.findMany({ where: { host }, orderBy: { receivedAt: "desc" }, take: HISTORY_LIMIT })).map((h) => {
    const hs = heartbeatSchema.safeParse(h.status);
    return { id: h.id, receivedAt: h.receivedAt, data: hs.success ? hs.data : null };
  });
  // PubLiKiosk 3.32 rapporterar minnet: kolumn i tabellen och en trend över rapporterna
  const hasMemory = history.some((h) => h.data?.memAvailMb !== undefined);
  const memoryPoints = history
    .filter((h) => h.data?.memAvailMb !== undefined)
    .map((h) => ({ at: h.receivedAt.getTime(), avail: h.data!.memAvailMb!, app: h.data!.appPssMb, low: h.data!.memLow === true }))
    .reverse();
  const cols = 3 + (c.platform === "linux" ? 1 : 0) + (hasMemory ? 1 : 0);
  const effective = mergeLayers(layers);
  const keys = Object.keys(effective).sort();
  const keyWidth = Math.max(...keys.map((k) => k.length + (effective[k].value.length + 3)), 0);

  const facts: [string, React.ReactNode][] = [
    ["Värdnamn", c.hostname],
    ["IP-adress", c.lastIp ?? "–"],
    ["System", s ? `${s.os ?? "–"}${s.kernel ? ` (${s.kernel})` : ""}` : "–"],
    // Kod, kraschade tjänster och disk rapporteras bara av Linux-datorerna (publicom)
    ...(c.platform === "linux"
      ? ([["Kod", s ? `${s.branch ?? "–"}, ${formatTime(s.deployedAt)}${s.deployFilesChanged !== undefined ? ` (${s.deployFilesChanged} filer)` : ""}` : "–"]] as [string, React.ReactNode][])
      : []),
    ...(c.platform === "tizen"
      ? ([
          ["Spelare", s?.appVersion ?? "–"],
          ["Modell", s?.model ?? "–"],
        ] as [string, React.ReactNode][])
      : c.platform === "android"
      ? ([
          ["App", s?.appVersion ?? "–"],
          ["Modell", s?.model ?? "–"],
          ["WebView", s?.webViewVersion ?? "–"],
          ["Kioskläge", s?.kioskLocked === undefined ? "–" : s.kioskLocked ? "låst" : "inte låst"],
          ["Menyn", s?.menuEvent ?? "–"],
        ] as [string, React.ReactNode][])
      : ([
          ["guest.service", s ? `${s.guestService ?? "–"}${s.guestRestarts !== undefined ? `, ${s.guestRestarts} sessioner sedan start` : ""}` : "–"],
        ] as [string, React.ReactNode][])),
    ...(c.platform === "linux" ? ([["Kraschade tjänster", s && s.failedUnits.length ? s.failedUnits.join(", ") : "–"]] as [string, React.ReactNode][]) : []),
    ...(s?.memTotalMb !== undefined || s?.memAvailMb !== undefined
      ? ([["Minne", memoryText(s)]] as [string, React.ReactNode][])
      : []),
    ...(c.platform === "linux" || s?.diskFreePercent !== undefined
      ? ([["Ledig disk", s?.diskFreePercent !== undefined ? `${s.diskFreePercent} %` : "–"]] as [string, React.ReactNode][])
      : []),
    ["Config hämtad", c.configFetchedAt ? formatTime(c.configFetchedAt) : c.configState === "new" ? "aldrig (inte installerad)" : "aldrig (gamla configfiler)"],
    ["Config ändrad", formatTime(row.configUpdatedAt ?? undefined)],
    [
      "Inställningsversion",
      c.runningVersion
        ? `${c.runningVersion}${c.runningVersion === c.expectedVersion ? " (aktuell)" : ` (admin: ${c.expectedVersion ?? "–"})`}`
        : `rapporteras inte (äldre kod), admin: ${c.expectedVersion ?? "–"}`,
    ],
    ["Statusrapport", formatInterval(heartbeatInterval(c.status))],
    ["Först sedd", formatTime(row.firstSeenAt)],
  ];

  return (
    <div className="flex flex-col gap-5">
      {c.platform !== "linux" && atLeast(role, "it") && (
        <Enrollment
          host={c.host}
          enrolledAt={c.enrolledAt?.toISOString() ?? null}
          codeExpiresAt={c.enrollCodeExpiresAt?.toISOString() ?? null}
          recoveryCode={row.recoveryCode}
          unlockRequestedAt={row.pinUnlockRequestedAt?.toISOString() ?? null}
          tizen={c.platform === "tizen"}
        />
      )}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-base font-extrabold">System</h2>
          <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-4 gap-y-2 text-[13.5px]">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words font-mono text-[12.5px]">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={CARD}>
          <h2 className="text-base font-extrabold">Statusrapporter</h2>
          <div className="mt-2 max-h-[420px] overflow-auto">
            <table className="w-full border-collapse text-[13px] tabular-nums">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[11.5px] font-bold uppercase tracking-wide text-muted">
                  <th className="border-b border-line px-3 py-2">Tid</th>
                  <th className="border-b border-line px-3 py-2">Igång</th>
                  <th className="border-b border-line px-3 py-2">{c.platform === "tizen" ? "Sidan" : c.platform === "android" ? "Startsidan" : "Gästprogram"}</th>
                  {c.platform === "linux" && <th className="border-b border-line px-3 py-2">Fel</th>}
                  {hasMemory && <th className="border-b border-line px-3 py-2">Ledigt / appen</th>}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={cols} className="px-3 py-3 text-muted">Inga rapporter än.</td></tr>
                )}
                {history.map((h) => {
                  const d = h.data;
                  const bad =
                    d !== null &&
                    ((d.guestService !== undefined && d.guestService !== "active") || d.pageLoaded === false || d.failedUnits.length > 0);
                  return (
                    <tr key={h.id.toString()} className={bad ? "bg-[#fff5f5] font-semibold text-bad-ink" : ""}>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{formatTime(h.receivedAt)}</td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{d ? formatDuration(d.uptimeSeconds) : "–"}</td>
                      <td className="border-b border-line-soft px-3 py-2">
                        {!d ? "–" : d.guestService ?? (d.pageLoaded === undefined ? "–" : d.pageLoaded ? "laddad" : "inte laddad")}
                      </td>
                      {c.platform === "linux" && (
                        <td className="border-b border-line-soft px-3 py-2">{d && d.failedUnits.length ? d.failedUnits.join(", ") : "–"}</td>
                      )}
                      {hasMemory && (
                        <td className={`whitespace-nowrap border-b border-line-soft px-3 py-2 ${d?.memLow ? "font-semibold text-bad-ink" : ""}`}>
                          {d?.memAvailMb === undefined ? "–" : `${d.memAvailMb} / ${d.appPssMb ?? "–"} MB${d.memLow ? " (lågt)" : ""}`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {memoryPoints.length > 1 && <MemoryTrend points={memoryPoints} totalMb={s?.memTotalMb} />}

      {s?.events && s.events.length > 0 && (
        <section className={CARD}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-extrabold">Händelser på enheten</h2>
            <span className="text-[13px] text-muted">De senaste {s.events.length}, äldst först, i enhetens tid · från rapporten {formatTime(c.lastSeenAt)}</span>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[#f8f9fa] px-4 py-3.5 font-mono text-xs leading-6">{s.events.join("\n")}</pre>
        </section>
      )}

      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-extrabold">Det datorn får vid start</h2>
          <span className="text-[13px] text-muted">Samma innehåll som <span className="font-mono">/api/device/config</span> skickar, med varifrån varje värde kommer</span>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[#f8f9fa] px-4 py-3.5 font-mono text-xs leading-7">
          {keys.map((k) => {
            const e = effective[k];
            const line = `${k}="${e.value}"`;
            return (
              <div key={k}>
                <span className="font-semibold text-select-ink">{k}</span>{`="${e.value}"`}
                <span className="text-faint">{" ".repeat(Math.max(2, Math.min(keyWidth, 60) - line.length + 2))}# {SOURCE_LABEL[e.source](c.profileLabel)}</span>
              </div>
            );
          })}
        </pre>
      </section>

      {atLeast(role, "it") && <DeleteComputer host={c.host} name={c.name} />}
    </div>
  );
}

type HeartbeatData = NonNullable<ReturnType<typeof heartbeatSchema.safeParse>["data"]>;

/** "ledigt 739 av 2000 MB, appen 210 MB, lågt minne: nej" (PubLiKiosk 3.32) */
function memoryText(s: HeartbeatData): string {
  const parts = [
    `ledigt ${s.memAvailMb ?? "–"} av ${s.memTotalMb ?? "–"} MB`,
    ...(s.appPssMb !== undefined ? [`appen ${s.appPssMb} MB`] : []),
    ...(s.memLow !== undefined ? [`lågt minne: ${s.memLow ? "ja" : "nej"}`] : []),
  ];
  return parts.join(", ");
}

type MemoryPoint = { at: number; avail: number; app?: number; low: boolean };

/** Ledigt minne och appens minne över de senaste rapporterna, som två linjer (äldst till vänster). */
function MemoryTrend({ points, totalMb }: { points: MemoryPoint[]; totalMb?: number }) {
  const W = 600;
  const H = 120;
  const PAD = 4;
  const first = points[0].at;
  const span = Math.max(points[points.length - 1].at - first, 1);
  const top = Math.max(totalMb ?? 0, ...points.map((p) => Math.max(p.avail, p.app ?? 0)), 1);
  const x = (at: number) => PAD + ((at - first) / span) * (W - 2 * PAD);
  const y = (mb: number) => H - PAD - (mb / top) * (H - 2 * PAD);
  const line = (pts: { at: number; mb: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.mb).toFixed(1)}`).join(" ");
  const avail = points.map((p) => p.avail);
  const apps = points.filter((p) => p.app !== undefined).map((p) => p.app!);
  const range = (v: number[]) => (v.length ? `${Math.min(...v)}–${Math.max(...v)} MB` : "–");
  const lowCount = points.filter((p) => p.low).length;

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold">Minne</h2>
        <span className="text-[13px] text-muted">
          {points.length} rapporter, {formatTime(new Date(first))} – {formatTime(new Date(points[points.length - 1].at))}
          {totalMb !== undefined && ` · ${totalMb} MB totalt`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-32 w-full rounded-lg border border-line bg-[#f8f9fa]" role="img" aria-label="Ledigt minne och appens minne över tid">
        {points.filter((p) => p.low).map((p) => (
          <line key={p.at} x1={x(p.at)} x2={x(p.at)} y1={0} y2={H} stroke="#e5484d" strokeOpacity={0.25} strokeWidth={3} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={line(points.map((p) => ({ at: p.at, mb: p.avail })))} fill="none" stroke="#1954a6" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {apps.length > 1 && (
          <path d={line(points.filter((p) => p.app !== undefined).map((p) => ({ at: p.at, mb: p.app! })))} fill="none" stroke="#d85497" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-[#1954a6]" />Ledigt {range(avail)}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-[#d85497]" />Appen {range(apps)}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 bg-[#e5484d]/40" />Lågt minne i {lowCount} av {points.length}</span>
      </div>
    </section>
  );
}
