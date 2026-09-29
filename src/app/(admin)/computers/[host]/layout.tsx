import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getComputerView } from "@/lib/computers";
import { HealthBadge } from "@/components/health-badge";
import { Chip } from "@/components/ui/chip";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";

export default async function ComputerLayout({ params, children }: LayoutProps<"/computers/[host]">) {
  await requireAdmin();
  const { host } = await params;
  const c = await getComputerView(host);
  if (!c) notFound();

  const base = `/computers/${host}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/" className="inline-flex w-fit items-center gap-1 text-[13.5px] font-semibold text-kth-blue">
          <ChevronLeftIcon />
          Datorer
        </Link>
        <h1 className="text-[26px] font-extrabold tracking-tight">{c.computerName || c.host}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="font-mono text-[13px]">{c.host}</span>
          <HealthBadge health={c.evaluation.health} />
          <span>
            Profil:{" "}
            {c.profile ? (
              <Link href={`/config/profiles/${c.profile}`} className="font-semibold text-kth-blue">{c.profile}</Link>
            ) : (
              "ingen"
            )}
          </span>
          {c.configState === "pending" && <Chip tone="draft">Väntar på omstart</Chip>}
          {c.configState === "legacy" && <Chip>Gamla configfiler</Chip>}
        </div>
      </div>
      <Tabs
        label="Dator"
        tabs={[
          { href: base, label: "Översikt" },
          { href: `${base}/settings`, label: "Inställningar" },
          { href: `${base}/history`, label: "Historik" },
          { href: `${base}/tech`, label: "Teknik" },
        ]}
      />
      {children}
    </div>
  );
}
