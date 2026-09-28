import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  getComputerConfig,
  getEffectiveConfig,
  listCatalog,
  listProfiles,
  serializeEnv,
} from "@/lib/config";
import { saveComputerConfigAction } from "../../../config/actions";
import { ConfigEditor } from "../../../config/config-editor";

export const dynamic = "force-dynamic";

export default async function ComputerConfigPage({ params }: { params: Promise<{ host: string }> }) {
  await requireAdmin();
  const { host } = await params;
  const computer = await getComputerConfig(host);
  if (!computer) {
    return <p className="text-gray-600">Datorn <code>{host}</code> finns inte.</p>;
  }

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const [profiles, catalog, effective] = await Promise.all([
    listProfiles(),
    listCatalog(),
    getEffectiveConfig(host, origin),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-kth-navy">
          {host}
          {computer.computerName && <span className="ml-2 text-base text-gray-500">{computer.computerName}</span>}
        </h1>
        <div className="flex gap-4 text-sm">
          <Link href={`/computers/${host}`} className="text-kth-blue hover:underline">Status</Link>
          <Link href={`/config/history/host:${host}`} className="text-kth-blue hover:underline">Historik</Link>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium text-kth-navy">Profil och overrides</h2>
        <ConfigEditor
          action={saveComputerConfigAction.bind(null, host)}
          initialConfig={serializeEnv(computer.overrides)}
          profiles={profiles}
          currentProfile={computer.profile}
          catalog={catalog}
        />
      </div>

      <div>
        <h2 className="text-lg font-medium text-kth-navy">Effektiv config (förhandsvisning)</h2>
        <p className="text-sm text-gray-600">base ⊕ {computer.profile ?? "(ingen profil)"} ⊕ overrides — det datorn faktiskt får.</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-50 p-3 font-mono text-xs text-gray-800">
          {effective ? serializeEnv(effective) : "(kunde inte beräknas)"}
        </pre>
      </div>
    </div>
  );
}
