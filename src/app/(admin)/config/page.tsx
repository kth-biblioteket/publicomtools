import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listProfileSummaries } from "@/lib/profiles";
import { NewProfile } from "@/components/profiles/new-profile";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  await requireAdmin();
  const profiles = await listProfileSummaries();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Profiler"
        lead="En profil samlar inställningar för en sorts dator. Alla datorer med profilen får dem, om datorn inte har ett eget värde."
        actions={<NewProfile profiles={profiles.map((p) => ({ name: p.name, label: p.label, platform: p.platform }))} />}
      />
      {PLATFORMS.map((platform) => {
        const list = profiles.filter((p) => p.platform === platform);
        // Android och Tizen syns när de har en profil
        if (!list.length && platform !== "linux") return null;
        return (
          <section key={platform} className="flex flex-col gap-3">
            <h2 className="h-section">{PLATFORM_LABEL[platform]}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((p) => (
                <Link key={p.name} href={`/config/profiles/${p.name}`} className="flex flex-col gap-2.5 rounded-xl border border-line border-t-4 border-t-kth-blue bg-white px-5 py-4 text-ink hover:border-kth-blue">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-extrabold text-kth-navy">{p.label}</span>
                    <span className="font-mono text-xs text-faint">{p.name}</span>
                  </span>
                  {p.description && <span className="text-sm text-muted">{p.description}</span>}
                  <span className="text-[13px] text-muted">
                    {p.keyCount} egna inställningar · {p.computers.length}{" "}
                    {platform === "linux" ? (p.computers.length === 1 ? "dator" : "datorer") : p.computers.length === 1 ? "enhet" : "enheter"}
                  </span>
                  {p.computers.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {p.computers.map((c) => (
                        <span key={c.host} className="inline-flex h-6 items-center rounded-md bg-select px-2 text-[12.5px] font-semibold text-kth-navy">{c.name}</span>
                      ))}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-sm text-muted">
        Inställningar som gäller alla datorer eller enheter av ett slag finns under{" "}
        <Link href="/config/base" className="font-semibold text-kth-blue">Grundinställningar</Link>.
      </p>
    </div>
  );
}
