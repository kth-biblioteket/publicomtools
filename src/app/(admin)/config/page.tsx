import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProfiles } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ConfigHomePage() {
  await requireAdmin();
  const [profiles, computers] = await Promise.all([
    listProfiles(),
    db.computer.findMany({ select: { host: true, computerName: true, profile: true }, orderBy: { host: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-kth-navy">Konfiguration</h1>
        <p className="mt-1 text-sm text-gray-600">
          Effektiv config för en dator = <code>base</code> ⊕ profil ⊕ dator-overrides. Datorerna hämtar den
          via <code>/api/device/config</code>. Ändringar slår igenom vid datorns nästa hämtning.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium text-kth-navy">Lager</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link href="/config/base" className="text-kth-blue hover:underline">base</Link>
            <span className="text-gray-500"> — gemensamma standardvärden</span>
          </li>
          {profiles.map((p) => (
            <li key={p}>
              <Link href={`/config/profiles/${p}`} className="text-kth-blue hover:underline">
                profil: {p}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium text-kth-navy">Datorer</h2>
        <table className="mt-2 min-w-full divide-y divide-gray-200 text-sm">
          <thead className="text-left text-kth-navy">
            <tr>
              <th className="py-1 pr-4 font-medium">Dator</th>
              <th className="py-1 pr-4 font-medium">Profil</th>
              <th className="py-1 font-medium">Config</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {computers.map((c) => (
              <tr key={c.host}>
                <td className="py-1 pr-4">
                  {c.host}
                  {c.computerName && <span className="text-xs text-gray-500"> · {c.computerName}</span>}
                </td>
                <td className="py-1 pr-4">{c.profile ?? "–"}</td>
                <td className="py-1">
                  <Link href={`/computers/${c.host}/config`} className="text-kth-blue hover:underline">
                    Redigera
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
