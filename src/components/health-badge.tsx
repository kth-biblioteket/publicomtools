import type { Health } from "@/lib/status";

const STYLES: Record<Health, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-ok-bg text-ok-ink" },
  warning: { label: "Behöver tittas på", className: "bg-warn-bg text-warn-ink" },
  offline: { label: "Ingen kontakt", className: "bg-bad-bg text-bad-ink" },
};

export function HealthBadge({ health }: { health: Health }) {
  const { label, className } = STYLES[health];
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold ${className}`}>
      <span className="size-[7px] rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
