import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listComputers } from "@/lib/computers";
import { formatDuration, formatTime } from "@/lib/status";
import { HealthBadge } from "@/components/health-badge";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  await requireAdmin();
  const computers = await listComputers();
  const counts = {
    ok: computers.filter((c) => c.evaluation.health === "ok").length,
    warning: computers.filter((c) => c.evaluation.health === "warning").length,
    offline: computers.filter((c) => c.evaluation.health === "offline").length,
  };

  return (
    <div>
      <AutoRefresh />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-kth-navy">Datorer</h1>
        <p className="text-sm text-gray-600">
          <span className="text-green-700">{counts.ok} OK</span>
          {" · "}
          <span className="text-yellow-800">{counts.warning} varning</span>
          {" · "}
          <span className="text-red-700">{counts.offline} ingen kontakt</span>
          {" · uppdateras var 30:e sekund"}
        </p>
      </div>

      {computers.length === 0 ? (
        <p className="mt-6 text-gray-600">
          Inga datorer har rapporterat än. En dator dyker upp här efter sin första heartbeat, alltså när{" "}
          <code>HEARTBEAT_TOKEN</code> finns i dess <code>.secrets</code>.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-kth-light-blue text-left text-kth-navy">
              <tr>
                <th className="px-3 py-2 font-medium">Dator</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Senast sedd</th>
                <th className="px-3 py-2 font-medium">Igång</th>
                <th className="px-3 py-2 font-medium">Profil</th>
                <th className="px-3 py-2 font-medium">Deploy</th>
                <th className="px-3 py-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {computers.map((c) => (
                <tr key={c.host} className="align-top hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/computers/${c.host}`} className="font-medium text-kth-blue hover:underline">
                      {c.host}
                    </Link>
                    {c.computerName && <div className="text-xs text-gray-500">{c.computerName}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <HealthBadge health={c.evaluation.health} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDuration(c.secondsSinceSeen)} sedan
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.status ? formatDuration(c.status.uptimeSeconds) : "–"}
                  </td>
                  <td className="px-3 py-2">{c.profile ?? "–"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.status?.branch ?? "–"}
                    <div className="text-xs text-gray-500">{formatTime(c.status?.deployedAt)}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {c.evaluation.problems.length > 0 ? (
                      <ul className="list-disc pl-4">
                        {c.evaluation.problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
