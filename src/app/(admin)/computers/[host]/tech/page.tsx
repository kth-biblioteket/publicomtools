import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getComputerView } from "@/lib/computers";
import { loadLayers, mergeLayers, type ConfigSource } from "@/lib/config";
import { heartbeatSchema } from "@/lib/heartbeat";
import { formatDuration, formatTime } from "@/lib/status";
import { DeleteComputer } from "./delete-computer";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 100;
const CARD = "rounded-xl border border-line bg-white px-6 py-5 shadow-sm";

const SOURCE_LABEL: Record<ConfigSource, (profile: string | null) => string> = {
  base: () => "grundinställningar",
  profile: (p) => `profilen ${p}`,
  host: () => "satt här",
  auto: () => "automatiskt",
};

export default async function ComputerTechPage({ params }: PageProps<"/computers/[host]/tech">) {
  const { host } = await params;
  const [c, row, layers] = await Promise.all([
    getComputerView(host),
    db.computer.findUnique({ where: { host }, select: { firstSeenAt: true, configUpdatedAt: true } }),
    loadLayers(host),
  ]);
  if (!c || !row || !layers) notFound();

  const s = c.status;
  const history = await db.heartbeat.findMany({ where: { host }, orderBy: { receivedAt: "desc" }, take: HISTORY_LIMIT });
  const effective = mergeLayers(layers);
  const keys = Object.keys(effective).sort();
  const keyWidth = Math.max(...keys.map((k) => k.length + (effective[k].value.length + 3)), 0);

  const facts: [string, React.ReactNode][] = [
    ["Värdnamn", c.hostname],
    ["IP-adress", c.lastIp ?? "–"],
    ["System", s ? `${s.os ?? "–"}${s.kernel ? ` (${s.kernel})` : ""}` : "–"],
    ["Kod", s ? `${s.branch ?? "–"}, ${formatTime(s.deployedAt)}${s.deployFilesChanged !== undefined ? ` (${s.deployFilesChanged} filer)` : ""}` : "–"],
    ["guest.service", s ? `${s.guestService}${s.guestRestarts !== undefined ? `, ${s.guestRestarts} sessioner sedan start` : ""}` : "–"],
    ["Kraschade tjänster", s && s.failedUnits.length ? s.failedUnits.join(", ") : "–"],
    ["Ledig disk", s?.diskFreePercent !== undefined ? `${s.diskFreePercent} %` : "–"],
    ["Config hämtad", c.configFetchedAt ? formatTime(c.configFetchedAt) : "aldrig (gamla configfiler)"],
    ["Config ändrad", formatTime(row.configUpdatedAt ?? undefined)],
    ["Först sedd", formatTime(row.firstSeenAt)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-base font-extrabold">System</h2>
          <dl className="mt-3 grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
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
                  <th className="border-b border-line px-3 py-2">Gästprogram</th>
                  <th className="border-b border-line px-3 py-2">Fel</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-3 text-muted">Inga rapporter än.</td></tr>
                )}
                {history.map((h) => {
                  const hs = heartbeatSchema.safeParse(h.status);
                  const bad = hs.success && (hs.data.guestService !== "active" || hs.data.failedUnits.length > 0);
                  return (
                    <tr key={h.id.toString()} className={bad ? "bg-[#fff5f5] font-semibold text-bad-ink" : ""}>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{formatTime(h.receivedAt)}</td>
                      <td className="whitespace-nowrap border-b border-line-soft px-3 py-2">{hs.success ? formatDuration(hs.data.uptimeSeconds) : "–"}</td>
                      <td className="border-b border-line-soft px-3 py-2">{hs.success ? hs.data.guestService : "–"}</td>
                      <td className="border-b border-line-soft px-3 py-2">{hs.success && hs.data.failedUnits.length ? hs.data.failedUnits.join(", ") : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

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

      <DeleteComputer host={c.host} name={c.name} />
    </div>
  );
}
