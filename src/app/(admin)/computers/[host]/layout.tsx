import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getComputerView } from "@/lib/computers";
import { formatWithin, heartbeatInterval, waitingText } from "@/lib/status";
import { HealthBadge } from "@/components/health-badge";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { RenameComputer } from "./rename-computer";
import { ReloadButton } from "./reload-button";
import { RebootButton } from "./reboot-button";

/** "11.35" */
function clock(d: Date) {
  return d.toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).replace(":", ".");
}

export default async function ComputerLayout({ params, children }: LayoutProps<"/computers/[host]">) {
  await requireAdmin();
  const { host } = await params;
  const c = await getComputerView(host);
  if (!c) notFound();

  const base = `/computers/${host}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/", label: "Enheter" }}
        heading={<RenameComputer host={c.host} name={c.name} label={c.label} panelName={c.computerName} />}
        tabs={
          <Tabs
            band
            label="Dator"
            tabs={[
              { href: base, label: "Översikt" },
              { href: `${base}/settings`, label: "Inställningar" },
              { href: `${base}/usage`, label: "Användning" },
              { href: `${base}/history`, label: "Historik" },
              { href: `${base}/tech`, label: "Teknik" },
            ]}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#3d4450]">
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
                requestedAt={c.reloadRequestedAt ? clock(c.reloadRequestedAt) : null}
                within={formatWithin(heartbeatInterval(c.status))}
                waiting={waitingText(c.status, "reload")}
              />
            </>
          )}
          {/* Datorer med gamla configfiler, eller som inte är installerade, kör inte koden som kan starta om.
              En Tizen-skärm kan inte startas om utifrån (det kräver Samsungs partnercertifikat). */}
          {(c.configState === "current" || c.configState === "pending") && !c.reloadRequestedAt && c.platform !== "tizen" && (
            <RebootButton
              host={c.host}
              name={c.name}
              requestedAt={c.rebootRequestedAt ? clock(c.rebootRequestedAt) : null}
              within={formatWithin(heartbeatInterval(c.status))}
              waiting={waitingText(c.status, "reboot")}
            />
          )}
          {c.configState === "legacy" && <Chip>Gamla configfiler</Chip>}
          {c.configState === "new" && <Chip tone="draft">{c.platform !== "linux" ? "Väntar på inskrivning" : "Väntar på installation"}</Chip>}
        </div>
      </PageHeader>
      {children}
    </div>
  );
}
