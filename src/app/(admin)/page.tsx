import { requireAdmin } from "@/lib/auth";
import { listComputers } from "@/lib/computers";
import { formatAgo, formatWhen } from "@/lib/status";
import { ComputerList, type ComputerRow } from "./computer-list";
import { AddComputer } from "./add-computer";
import { listProfileSummaries } from "@/lib/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { PLATFORMS, type Platform } from "@/lib/platforms";

/** "11 datorer", "2 Android-enheter", "1 Tizen-skärm" */
const NOUNS: Record<Platform, [string, string]> = {
  linux: ["dator", "datorer"],
  android: ["Android-enhet", "Android-enheter"],
  tizen: ["Tizen-skärm", "Tizen-skärmar"],
};

function countText(rows: { platform: Platform }[]) {
  const parts = PLATFORMS.map((p) => [p, rows.filter((r) => r.platform === p).length] as const)
    .filter(([, n]) => n > 0)
    .map(([p, n]) => `${n} ${NOUNS[p][n === 1 ? 0 : 1]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} och ${parts.at(-1)}` : (parts[0] ?? "");
}

export const dynamic = "force-dynamic";

export default async function ComputersPage() {
  await requireAdmin();
  const now = new Date();
  const [computers, summaries] = await Promise.all([listComputers(), listProfileSummaries()]);
  const profiles = summaries.map((p) => ({ name: p.name, label: p.label, platform: p.platform }));

  const rows: ComputerRow[] = computers.map((c) => ({
    host: c.host,
    platform: c.platform,
    panelName: c.label && c.computerName && c.computerName !== c.label ? c.computerName : null,
    name: c.name,
    profile: c.profileLabel,
    health: c.evaluation.health,
    // Offline shows the exact time ("i fredags kl 11.32"); otherwise "för 2 min sedan".
    seen: c.status ? (c.evaluation.health === "offline" ? formatWhen(c.lastSeenAt, now) : formatAgo(c.lastSeenAt, now)) : "aldrig",
    problems: c.evaluation.problems.map((p) => p.text),
    configState: c.configState,
  }));

  const renderedAt = now.toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).replace(":", ".");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Enheter"
        lead={`${rows.length} ${rows.length === 1 ? "enhet" : "enheter"}${rows.length ? `: ${countText(rows)}` : ""}. De som behöver åtgärdas visas först.`}
        actions={<AddComputer profiles={profiles} />}
      />
      <ComputerList rows={rows} renderedAt={renderedAt} />
    </div>
  );
}
