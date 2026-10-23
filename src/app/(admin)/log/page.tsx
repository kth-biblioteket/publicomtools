import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { LogFilter } from "@/lib/changelog";
import { PageHeader } from "@/components/ui/page-header";
import { ChangeLog } from "@/components/log/change-log";

export const dynamic = "force-dynamic";

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "Allt" },
  { id: "base", label: "Grundinställningar" },
  { id: "profile", label: "Profiler" },
  { id: "host", label: "Enheter" },
];

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  await requireAdmin();
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f)?.id ?? "all";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ändringslogg" lead="Alla ändringar av inställningar, nyast först." />
      <nav aria-label="Filtrera" className="seg w-fit">
        {FILTERS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "all" ? "/log" : `/log?f=${x.id}`}
            aria-current={filter === x.id ? "page" : undefined}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <ChangeLog filter={filter} />
    </div>
  );
}
