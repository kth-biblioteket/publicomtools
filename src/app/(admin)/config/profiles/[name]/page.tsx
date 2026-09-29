import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsData } from "@/lib/settings";
import { ProfileMeta } from "@/components/profiles/profile-meta";
import { SettingsEditor } from "@/components/settings/settings-editor";
import { ChevronLeftIcon } from "@/components/ui/icons";
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
      <div className="flex flex-col gap-2">
        <Link href="/config" className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-kth-blue">
          <ChevronLeftIcon />
          Profiler
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-3 text-[26px] font-extrabold tracking-tight">
          {label}
          <span className="font-mono text-sm font-medium text-faint">{name}</span>
        </h1>
        {layer?.description && <p className="text-sm text-muted">{layer.description}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            Används av {users.length} {users.length === 1 ? "dator" : "datorer"}
            {users.length ? ":" : "."}
          </span>
          {users.map((c) => (
            <Link key={c.host} href={`/computers/${c.host}`} className="inline-flex h-[26px] items-center rounded-md bg-[#eceef1] px-2.5 text-[13px] font-semibold text-[#3d444d] hover:bg-select">
              {c.name}
            </Link>
          ))}
        </div>
      </div>
      <ProfileMeta name={name} label={label} description={layer?.description ?? null} used={users.length} />
      <Tabs
        label="Profil"
        tabs={[
          { href: `/config/profiles/${name}`, label: "Inställningar" },
          { href: `/config/history/profile:${name}`, label: "Historik" },
        ]}
      />
      <SettingsEditor key={JSON.stringify(data.own)} data={data} title={`Profil ${label}`} />
    </div>
  );
}
