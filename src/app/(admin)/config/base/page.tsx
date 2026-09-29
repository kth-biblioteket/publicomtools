import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSettingsData } from "@/lib/settings";
import { SettingsEditor } from "@/components/settings/settings-editor";
import { Tabs } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function BaseSettingsPage() {
  await requireAdmin();
  const data = await getSettingsData("base");
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Grundinställningar</h1>
        <p className="mt-1 max-w-[640px] text-sm text-muted">
          Gäller alla {data.computers.length} datorer. Profiler och enskilda datorer kan ändra dem.
        </p>
      </div>
      <div className="rounded-[10px] bg-warn-bg px-4 py-2.5 text-sm text-warn-ink">
        Ändringar här påverkar alla datorer. Granskningen visar exakt vilka som får nya värden.
      </div>
      <Tabs label="Grundinställningar" tabs={[{ href: "/config/base", label: "Inställningar" }, { href: "/config/history/base", label: "Historik" }]} />
      <SettingsEditor key={JSON.stringify(data.own)} data={data} title="Grundinställningar" />
    </div>
  );
}
