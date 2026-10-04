import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getComputerView } from "@/lib/computers";
import { getComputerConfig } from "@/lib/config";
import { formatAgo, formatDuration, formatWhen } from "@/lib/status";
import { AutoRefresh } from "@/components/auto-refresh";
import { AlertIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

const CARD = "min-w-0 rounded-xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6";

function targetLabel(target: string) {
  if (target === "base") return "Grundinställningar";
  if (target.startsWith("profile:")) return "Profilen";
  return "Den här datorn";
}

export default async function ComputerOverviewPage({ params }: PageProps<"/computers/[host]">) {
  // Every page checks itself: the [host] layout is not re-rendered on client-side navigation.
  await requireAdmin();
  const { host } = await params;
  const [c, config] = await Promise.all([getComputerView(host), getComputerConfig(host)]);
  if (!c || !config) notFound();

  const now = new Date();
  const s = c.status;
  const ownCount = Object.keys(config.overrides).length;
  const changes = await db.configChange.findMany({
    where: { target: { in: ["base", `host:${host}`, ...(c.profile ? [`profile:${c.profile}`] : [])] } },
    orderBy: { changedAt: "desc" },
    take: 3,
    select: { id: true, target: true, changedAt: true, changedBy: true },
  });

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={CARD}>
          <h2 className="text-[17px] font-extrabold">{c.evaluation.problems.length ? "Att göra" : "Allt ser bra ut"}</h2>
          {c.evaluation.problems.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Datorn rapporterar inga problem.</p>
          ) : (
            <ul className="mt-1">
              {c.evaluation.problems.map((p) => (
                <li key={p.text} className="flex gap-3.5 border-t border-line-soft py-4 first:border-0 first:pt-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      c.evaluation.health === "offline" ? "bg-bad-bg text-bad-ink" : "bg-warn-bg text-warn-ink"
                    }`}
                  >
                    <AlertIcon />
                  </span>
                  <div>
                    <div className="text-[15px] font-bold">{p.text}</div>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{p.hint}</p>
                    {p.detail && <div className="mt-1.5 font-mono text-xs text-faint">{p.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-[17px] font-extrabold">Just nu</h2>
          <dl className="mt-3.5 grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted">Senast kontakt</dt>
            <dd>{s ? `${formatAgo(c.lastSeenAt, now)} (${formatWhen(c.lastSeenAt, now)})` : "aldrig"}</dd>
            <dt className="text-muted">Igång sedan</dt>
            <dd>{s ? formatDuration(s.uptimeSeconds) : "–"}</dd>
            <dt className="text-muted">Gästprogrammet</dt>
            <dd>{s ? (s.guestService === "active" ? "Igång" : s.guestService) : "–"}</dd>
            <dt className="text-muted">Profil</dt>
            <dd>
              {c.profile ? (
                <Link href={`/config/profiles/${c.profile}`} className="text-kth-blue">{c.profileLabel}</Link>
              ) : (
                "ingen"
              )}
            </dd>
            <dt className="text-muted">Egna inställningar</dt>
            <dd>
              {ownCount} st ·{" "}
              <Link href={`/computers/${host}/settings`} className="text-kth-blue">Visa</Link>
            </dd>
            <dt className="text-muted">Inställningar</dt>
            <dd>
              {c.configState === "new"
                ? "Inte hämtade än (datorn är inte installerad)"
                : c.configState === "legacy"
                ? "Hämtas från de gamla configfilerna på GitHub"
                : `Hämtade ${formatWhen(c.configFetchedAt!, now)}${c.configState === "pending" ? ", ändrade efter det" : ""}`}
            </dd>
          </dl>
        </section>
      </div>

      <section className={CARD}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[17px] font-extrabold">Senaste ändringar som påverkar datorn</h2>
          <Link href={`/computers/${host}/history`} className="text-[13.5px] font-semibold text-kth-blue">Visa historik</Link>
        </div>
        {changes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Inga ändringar än.</p>
        ) : (
          <ul className="mt-2 text-sm">
            {changes.map((ch) => (
              <li
                key={ch.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-t border-line-soft py-2.5 sm:grid-cols-[140px_200px_minmax(0,1fr)]"
              >
                <span className="text-muted">{formatWhen(ch.changedAt, now)}</span>
                <span>{targetLabel(ch.target)}</span>
                <span className="col-span-2 truncate text-muted sm:col-span-1">{ch.changedBy}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
