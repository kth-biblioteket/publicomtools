import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { baseTarget, deviceNoun, PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/platforms";
import { signageProps } from "@/lib/media";
import { getSettingsData } from "@/lib/settings";
import { SettingsEditor } from "@/components/settings/settings-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";

/** Grundinställningar för en plattform (/config/base = Linux, /config/base/android, /config/base/tizen). */
export async function BaseView({ platform }: { platform: Platform }) {
  await requireAdmin();
  const target = baseTarget(platform);
  const data = await getSettingsData(target);
  if (!data) notFound();
  const n = data.computers.length;
  const devices = deviceNoun(platform, n);
  const all = `alla ${deviceNoun(platform, 2)}`;
  const href = platform === "linux" ? "/config/base" : `/config/base/${platform}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Grundinställningar"
        lead={`Gäller ${n === 1 ? "den enda" : `alla ${n}`} ${devices}. Profiler och enskilda ${platform === "linux" ? "datorer" : "enheter"} kan ändra dem.`}
        tabs={
          <Tabs
            band
            label="Plattform"
            tabs={PLATFORMS.map((p) => ({ href: p === "linux" ? "/config/base" : `/config/base/${p}`, label: PLATFORM_LABEL[p] }))}
          />
        }
      />
      <div className="rounded-[10px] bg-warn-bg px-4 py-2.5 text-sm text-warn-ink">
        Ändringar här påverkar {all}. Granskningen visar exakt vilka som får nya värden.
      </div>
      {data.catalog.length === 0 && (
        <p className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm text-muted">
          Inställningskatalogen för {PLATFORM_LABEL[platform]} är inte inläst. Läs in den under Inställningskatalog först.
        </p>
      )}
      <Tabs label="Grundinställningar" tabs={[{ href, label: "Inställningar" }, { href: `/config/history/${target}`, label: "Historik" }]} />
      <SettingsEditor
        key={JSON.stringify(data.own)}
        data={data}
        title={platform === "linux" ? "Grundinställningar" : `Grundinställningar ${PLATFORM_LABEL[platform]}`}
        signage={await signageProps(data.catalog)}
      />
    </div>
  );
}
