import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { ChangeLog } from "@/components/log/change-log";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
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
    <div className="flex max-w-[980px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        {profile && (
          <Link href="/config" className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-kth-blue">
            <ChevronLeftIcon />
            Profiler
          </Link>
        )}
        <h1 className="text-[26px] font-extrabold tracking-tight">
          {profile ?? (base && base !== "linux" ? `Grundinställningar ${PLATFORM_LABEL[base]}` : "Grundinställningar")}
        </h1>
      </div>
      <Tabs label="Historik" tabs={[{ href: settingsHref, label: "Inställningar" }, { href: `/config/history/${target}`, label: "Historik" }]} />
      <ChangeLog targets={[target]} showTarget={false} />
    </div>
  );
}
