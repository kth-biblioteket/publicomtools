import { requireAdmin } from "@/lib/auth";
import { ChangeLog } from "@/components/log/change-log";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { baseTargetPlatform, PLATFORM_LABEL } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/** Historik-fliken för grundinställningarna och profilerna. */
export default async function LayerHistoryPage({ params }: PageProps<"/config/history/[target]">) {
  await requireAdmin();
  const target = decodeURIComponent((await params).target);
  const profile = target.startsWith("profile:") ? target.slice(8) : null;
  const base = baseTargetPlatform(target);
  const settingsHref = profile ? `/config/profiles/${profile}` : base && base !== "linux" ? `/config/base/${base}` : "/config/base";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={profile ? { href: "/config", label: "Profiler" } : undefined}
        title={profile ?? (base && base !== "linux" ? `Grundinställningar ${PLATFORM_LABEL[base]}` : "Grundinställningar")}
        tabs={<Tabs band label="Historik" tabs={[{ href: settingsHref, label: "Inställningar" }, { href: `/config/history/${target}`, label: "Historik" }]} />}
      />
      <ChangeLog targets={[target]} showTarget={false} />
    </div>
  );
}
