import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { asPlatform, PLATFORM_SHORT } from "@/lib/platforms";
import { signageProps } from "@/lib/media";
import { getSettingsData } from "@/lib/settings";
import { ProfileMeta } from "@/components/profiles/profile-meta";
import { SettingsEditor } from "@/components/settings/settings-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage({ params }: PageProps<"/config/profiles/[name]">) {
  await requireAdmin();
  const { name } = await params;
  const data = await getSettingsData(`profile:${name}`);
  if (!data) notFound();
  const users = data.computers.filter((c) => c.profile === name);
  const layer = await db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name } }, select: { label: true, description: true } });
  const label = layer?.label || name;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/config", label: "Profiler" }}
        heading={
        <h1 className="flex flex-wrap items-baseline gap-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
          {label}
          <span className="inline-flex h-6 items-center self-center rounded-md bg-white px-[9px] text-[12.5px] font-bold text-kth-navy">{PLATFORM_SHORT[asPlatform(data.platform)]}</span>
          <span className="font-mono text-sm font-medium text-muted">{name}</span>
        </h1>
        }
        lead={layer?.description}
        tabs={
          <Tabs
            band
            label="Profil"
            tabs={[
              { href: `/config/profiles/${name}`, label: "Inställningar" },
              { href: `/config/history/profile:${name}`, label: "Historik" },
            ]}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#3d4450]">
          <span>
            Används av {users.length} {users.length === 1 ? "dator" : "datorer"}
            {users.length ? ":" : "."}
          </span>
          {users.map((c) => (
            <Link key={c.host} href={`/computers/${c.host}`} className="inline-flex h-[26px] items-center rounded-md bg-white px-2.5 text-[13px] font-semibold text-kth-navy hover:bg-select">
              {c.name}
            </Link>
          ))}
        </div>
        <ProfileMeta name={name} label={label} description={layer?.description ?? null} used={users.length} />
      </PageHeader>
      <SettingsEditor key={JSON.stringify(data.own)} data={data} title={`Profil ${label}`} signage={await signageProps(data.catalog)} />
    </div>
  );
}
