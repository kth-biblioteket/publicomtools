import type { Health } from "@/lib/status";

const STYLES: Record<Health, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-green-100 text-green-800 ring-green-600/20" },
  warning: { label: "Varning", className: "bg-yellow-100 text-yellow-900 ring-yellow-600/30" },
  offline: { label: "Ingen kontakt", className: "bg-red-100 text-red-800 ring-red-600/20" },
};

export function HealthBadge({ health }: { health: Health }) {
  const { label, className } = STYLES[health];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
