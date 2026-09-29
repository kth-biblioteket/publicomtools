import { ConfigHistory } from "@/components/config-history";

export const dynamic = "force-dynamic";

export default async function ComputerHistoryPage({ params }: PageProps<"/computers/[host]/history">) {
  const { host } = await params;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Ändringar av den här datorns egna inställningar och profil.</p>
      <ConfigHistory target={`host:${host}`} />
    </div>
  );
}
