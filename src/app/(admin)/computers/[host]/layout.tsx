import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getComputerView } from "@/lib/computers";
import { HealthBadge } from "@/components/health-badge";
import { Chip } from "@/components/ui/chip";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { RenameComputer } from "./rename-computer";
import { ReloadButton } from "./reload-button";

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
        <RenameComputer host={c.host} name={c.name} label={c.label} panelName={c.computerName} />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span className="font-mono text-[13px]">{c.host}</span>
          {c.label && c.computerName && c.computerName !== c.label && <span>I panelen: {c.computerName}</span>}
          <HealthBadge health={c.evaluation.health} />
          <span>
            Profil:{" "}
            {c.profile ? (
              <Link href={`/config/profiles/${c.profile}`} className="font-semibold text-kth-blue">{c.profileLabel}</Link>
            ) : (
              "ingen"
            )}
          </span>
          {c.configState === "pending" && (
            <>
              <Chip tone="draft">Väntar på omstart</Chip>
              <ReloadButton
                host={c.host}
                requestedAt={
                  c.reloadRequestedAt
                    ? c.reloadRequestedAt.toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).replace(":", ".")
                    : null
                }
              />
            </>
          )}
          {c.configState === "legacy" && <Chip>Gamla configfiler</Chip>}
          {c.configState === "new" && <Chip tone="draft">Väntar på installation</Chip>}
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
