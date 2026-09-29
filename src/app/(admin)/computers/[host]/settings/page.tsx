import { notFound } from "next/navigation";
import { getComputerConfig, getEffectiveConfig, listCatalog, listProfiles, serializeEnv } from "@/lib/config";
import { saveComputerConfigAction } from "../../../config/actions";
import { ConfigEditor } from "../../../config/config-editor";

export const dynamic = "force-dynamic";

// Tillfällig: den gamla textredigeraren, tills formuläret (omgång 3) ersätter den.
export default async function ComputerSettingsPage({ params }: PageProps<"/computers/[host]/settings">) {
  const { host } = await params;
  const computer = await getComputerConfig(host);
  if (!computer) notFound();

  const [profiles, catalog, effective] = await Promise.all([listProfiles(), listCatalog(), getEffectiveConfig(host, "")]);

  return (
    <div className="flex flex-col gap-6">
      <ConfigEditor
        action={saveComputerConfigAction.bind(null, host)}
        initialConfig={serializeEnv(computer.overrides)}
        profiles={profiles}
        currentProfile={computer.profile}
        catalog={catalog}
      />
      <div>
        <h2 className="text-base font-bold">Det datorn får vid start</h2>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-white p-4 font-mono text-xs">
          {effective ? serializeEnv(effective) : "(kunde inte beräknas)"}
        </pre>
      </div>
    </div>
  );
}
