import { notFound } from "next/navigation";
import { getSettingsData } from "@/lib/settings";
import { SettingsEditor } from "@/components/settings/settings-editor";

export const dynamic = "force-dynamic";

export default async function ComputerSettingsPage({ params }: PageProps<"/computers/[host]/settings">) {
  const { host } = await params;
  const data = await getSettingsData(`host:${host}`);
  if (!data) notFound();
  const name = data.computers.find((c) => c.host === host)?.name ?? host;
  return <SettingsEditor key={JSON.stringify([data.own, data.profile])} data={data} title={name} />;
}
