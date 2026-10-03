import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChangeLog } from "@/components/log/change-log";

export const dynamic = "force-dynamic";

export default async function ComputerHistoryPage({ params }: PageProps<"/computers/[host]/history">) {
  // Every page checks itself: the [host] layout is not re-rendered on client-side navigation.
  await requireAdmin();
  const { host } = await params;
  const c = await db.computer.findUnique({ where: { host }, select: { profile: true } });
  if (!c) notFound();
  return (
    <div className="flex max-w-[980px] flex-col gap-3">
      <p className="text-sm text-muted">Ändringar av datorns egna inställningar, dess profil och grundinställningarna.</p>
      <ChangeLog targets={[`host:${host}`, "base", ...(c.profile ? [`profile:${c.profile}`] : [])]} />
    </div>
  );
}
