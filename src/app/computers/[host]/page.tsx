import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toView } from "@/lib/computers";
import { heartbeatSchema } from "@/lib/heartbeat";
import { formatDuration, formatTime } from "@/lib/status";
import { HealthBadge } from "@/components/health-badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { deleteComputer } from "@/app/actions";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 100;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

export default async function ComputerPage({ params }: PageProps<"/computers/[host]">) {
  await requireAdmin();
  const { host } = await params;
  const computer = await db.computer.findUnique({ where: { host } });
  if (!computer) notFound();

  const view = toView(computer);
  const s = view.status;
  const history = await db.heartbeat.findMany({
    where: { host },
    orderBy: { receivedAt: "desc" },
    take: HISTORY_LIMIT,
  });

  return (
    <div>
      <AutoRefresh />
      <Link href="/" className="text-sm text-kth-blue hover:underline">
        ← Alla datorer
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-kth-navy">{view.host}</h1>
        <HealthBadge health={view.evaluation.health} />
      </div>
      {view.computerName && <p className="text-gray-600">{view.computerName}</p>}

      {view.evaluation.problems.length > 0 && (
        <ul className="mt-4 list-disc rounded-md bg-yellow-50 py-3 pl-8 pr-4 text-sm text-yellow-900">
          {view.evaluation.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <dl className="mt-6 max-w-3xl divide-y divide-gray-100 text-sm">
        <Row label="Värdnamn">{view.hostname}</Row>
        <Row label="IP-adress">{view.lastIp ?? "–"}</Row>
        <Row label="Senast sedd">{formatTime(view.lastSeenAt)}</Row>
        <Row label="Profil">
          {view.profile ?? "–"} {s?.computerType && <span className="text-gray-500">({s.computerType})</span>}
        </Row>
        <Row label="Igång sedan omstart">{s ? formatDuration(s.uptimeSeconds) : "–"}</Row>
        <Row label="Deploy">
          {s?.branch ?? "–"}, {formatTime(s?.deployedAt)}
          {s?.deployFilesChanged !== undefined && (
            <span className="text-gray-500"> ({s.deployFilesChanged} filer ändrade)</span>
          )}
        </Row>
        <Row label="Session (guest.service)">
          {s?.guestService ?? "–"}
          {s?.sessionStartedAt && <span className="text-gray-500">, startad {formatTime(s.sessionStartedAt)}</span>}
          {s?.guestRestarts !== undefined && (
            <span className="text-gray-500">, {s.guestRestarts} sessioner sedan omstart</span>
          )}
        </Row>
        <Row label="Kraschade tjänster">{s && s.failedUnits.length > 0 ? s.failedUnits.join(", ") : "–"}</Row>
        <Row label="Ledigt diskutrymme">{s?.diskFreePercent !== undefined ? `${s.diskFreePercent} %` : "–"}</Row>
        <Row label="Väntar på omstart">{s?.rebootRequired ? "Ja" : "Nej"}</Row>
        <Row label="System">
          {s?.os ?? "–"} {s?.kernel && <span className="text-gray-500">({s.kernel})</span>}
        </Row>
        <Row label="Först sedd">{formatTime(computer.firstSeenAt)}</Row>
      </dl>

      <h2 className="mt-8 text-lg font-semibold text-kth-navy">Senaste {HISTORY_LIMIT} rapporterna</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-kth-light-blue text-left text-kth-navy">
            <tr>
              <th className="px-3 py-2 font-medium">Tid</th>
              <th className="px-3 py-2 font-medium">Igång</th>
              <th className="px-3 py-2 font-medium">Session</th>
              <th className="px-3 py-2 font-medium">Kraschade tjänster</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map((h) => {
              const hs = heartbeatSchema.safeParse(h.status);
              return (
                <tr key={h.id.toString()}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatTime(h.receivedAt)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {hs.success ? formatDuration(hs.data.uptimeSeconds) : "–"}
                  </td>
                  <td className="px-3 py-1.5">{hs.success ? hs.data.guestService : "–"}</td>
                  <td className="px-3 py-1.5">
                    {hs.success && hs.data.failedUnits.length > 0 ? hs.data.failedUnits.join(", ") : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={deleteComputer} className="mt-10 border-t border-gray-200 pt-4">
        <input type="hidden" name="host" value={view.host} />
        <p className="text-sm text-gray-600">
          Ta bort en dator som inte längre används. Den kommer tillbaka vid nästa heartbeat om den fortfarande är
          igång.
        </p>
        <button
          type="submit"
          className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Ta bort {view.host} och dess historik
        </button>
      </form>
    </div>
  );
}
