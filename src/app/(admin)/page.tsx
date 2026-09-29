import { requireAdmin } from "@/lib/auth";
import { listComputers } from "@/lib/computers";
import { formatAgo, formatWhen } from "@/lib/status";
import { ComputerList, type ComputerRow } from "./computer-list";

export const dynamic = "force-dynamic";

export default async function ComputersPage() {
  await requireAdmin();
  const now = new Date();
  const computers = await listComputers();

  const rows: ComputerRow[] = computers.map((c) => ({
    host: c.host,
    name: c.computerName || c.host,
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
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Datorer</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} datorer och skyltar. De som behöver åtgärdas visas först.
        </p>
      </div>
      <ComputerList rows={rows} renderedAt={renderedAt} />
    </div>
  );
}
