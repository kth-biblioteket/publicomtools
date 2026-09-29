import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/status";
import { displayName } from "@/lib/names";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Pågår", className: "bg-ok-bg text-ok-ink" },
  working: { label: "Loggar in", className: "bg-warn-bg text-warn-ink" },
  pending: { label: "Väntar på inloggning", className: "bg-[#eceef1] text-[#3d444d]" },
  ended: { label: "Avslutad", className: "bg-[#eceef1] text-[#3d444d]" },
  superseded: { label: "Ersatt av ny inloggningsskärm", className: "bg-[#eceef1] text-[#3d444d]" },
};

const time = (d: Date | null) =>
  d ? d.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "–";

/** Guest logins (GuestLogin). No personal data is shown. */
export default async function GuestsPage({ searchParams }: PageProps<"/guests">) {
  await requireAdmin();
  const { d } = await searchParams;
  const days = d === "7" ? 7 : 1;
  const today = new Date();
  const since = new Date(today);
  if (days === 1) since.setHours(0, 0, 0, 0);
  else since.setDate(since.getDate() - 7);

  const [logins, computers] = await Promise.all([
    db.guestLogin.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.computer.findMany({ select: { host: true, computerName: true, label: true } }),
  ]);
  const names = new Map(computers.map((c) => [c.host, displayName(c)]));
  const now = today.getTime();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Gästsessioner</h1>
          <p className="mt-1 text-sm text-muted">Inloggningar på gästdatorerna med webbinloggningen. Inga personuppgifter visas.</p>
        </div>
        <nav aria-label="Period" className="inline-flex gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]">
          {[["1", "Idag"], ["7", "Senaste 7 dagarna"]].map(([v, l]) => (
            <Link key={v} href={v === "1" ? "/guests" : "/guests?d=7"} aria-current={String(days) === v ? "page" : undefined}
              className={`inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-semibold ${String(days) === v ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"}`}>
              {l}
            </Link>
          ))}
        </nav>
      </div>

      {logins.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-5 text-sm text-muted">Inga gästsessioner {days === 1 ? "idag" : "de senaste 7 dagarna"}.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                {["Dator", "Status", "Skärmen visades", "Inloggad", "Slut", "Längd", "Session"].map((h) => (
                  <th key={h} className="border-b border-line px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logins.map((g) => {
                const s = STATUS[g.status] ?? { label: g.status, className: "bg-[#eceef1] text-[#3d444d]" };
                const end = g.endedAt?.getTime() ?? (g.status === "active" ? now : null);
                return (
                  <tr key={g.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-2.5"><Link href={`/computers/${g.host}`} className="text-kth-blue">{names.get(g.host) ?? g.computerName ?? g.host}</Link></td>
                    <td className="px-4 py-2.5"><span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-bold ${s.className}`}>{s.label}</span></td>
                    <td className="px-4 py-2.5">{time(g.createdAt)}</td>
                    <td className="px-4 py-2.5">{time(g.activatedAt)}</td>
                    <td className="px-4 py-2.5">{time(g.endedAt)}</td>
                    <td className="px-4 py-2.5">{g.activatedAt && end ? formatDuration((end - g.activatedAt.getTime()) / 1000) : "–"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{g.id.slice(0, 6)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
