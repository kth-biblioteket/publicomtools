/** One key figure with its change since the previous period: "1 240 besök ▲ 12 %". */
export function StatCard({
  label,
  value,
  sub,
  change,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Text and direction of the change, or null when there is nothing to compare with */
  change?: { text: string; up: boolean } | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-white px-4 py-4 shadow-sm sm:px-5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="text-[28px] font-extrabold leading-tight tracking-tight tabular-nums">{value}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
        {change && (
          <span className={`font-bold ${change.up ? "text-ok-ink" : "text-bad-ink"}`}>
            <span aria-hidden="true">{change.up ? "▲" : "▼"}</span> {change.text}
          </span>
        )}
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

/** A card with a heading and a short explanation, the frame of every chart */
export function StatPanel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-white px-4 py-5 shadow-sm sm:px-6">
      <h2 className="text-base font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
