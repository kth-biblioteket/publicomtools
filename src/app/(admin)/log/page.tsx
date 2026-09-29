import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import type { LogFilter } from "@/lib/changelog";
import { ChangeLog } from "@/components/log/change-log";

export const dynamic = "force-dynamic";

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "Allt" },
  { id: "base", label: "Grundinställningar" },
  { id: "profile", label: "Profiler" },
  { id: "host", label: "Datorer" },
];

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  await requireAdmin();
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.id === f)?.id ?? "all";

  return (
    <div className="flex max-w-[980px] flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Ändringslogg</h1>
        <p className="mt-1 text-sm text-muted">Alla ändringar av inställningar, nyast först.</p>
      </div>
      <nav aria-label="Filtrera" className="inline-flex w-fit gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]">
        {FILTERS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "all" ? "/log" : `/log?f=${x.id}`}
            aria-current={filter === x.id ? "page" : undefined}
            className={`inline-flex h-[30px] items-center rounded-[7px] px-3 text-[13px] font-semibold ${
              filter === x.id ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      <ChangeLog filter={filter} />
    </div>
  );
}
