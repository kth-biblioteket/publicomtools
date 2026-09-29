import { requireAdmin } from "@/lib/auth";
import { ConfigHistory } from "@/components/config-history";

export const dynamic = "force-dynamic";

export default async function ConfigHistoryPage({ params }: { params: Promise<{ target: string }> }) {
  await requireAdmin();
  const { target } = await params;
  const decoded = decodeURIComponent(target);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Historik: {decoded}</h1>
        <p className="mt-1 text-sm text-muted">Senaste 50 ändringarna, nyast först. Återställ skriver tillbaka en tidigare version som en ny ändring.</p>
      </div>
      <ConfigHistory target={decoded} />
    </div>
  );
}
