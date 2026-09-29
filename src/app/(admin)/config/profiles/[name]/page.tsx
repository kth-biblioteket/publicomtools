import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSettingsData } from "@/lib/settings";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/config" className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-kth-blue">
          <ChevronLeftIcon />
          Profiler
        </Link>
        <h1 className="text-[26px] font-extrabold tracking-tight">{name}</h1>
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
      <Tabs
        label="Profil"
        tabs={[
          { href: `/config/profiles/${name}`, label: "Inställningar" },
          { href: `/config/history/profile:${name}`, label: "Historik" },
        ]}
      />
      <SettingsEditor key={JSON.stringify(data.own)} data={data} title={`Profil ${name}`} />
    </div>
  );
}
