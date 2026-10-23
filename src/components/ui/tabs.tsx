"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Tab = { href: string; label: string; badge?: React.ReactNode };

/** Page-level tabs as links; the active one follows the URL. "band": along the lower edge of the page header. */
export function Tabs({ tabs, label, band = false }: { tabs: Tab[]; label: string; band?: boolean }) {
  const path = usePathname();
  // Longest matching href wins, so /computers/x doesn't also light up on /computers/x/tech.
  const active = tabs
    .filter((t) => path === t.href || path.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  if (band)
    return (
      <nav aria-label={label} className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === active ? "page" : undefined}
            className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-t-lg border-t-4 px-4 text-[15px] font-bold text-kth-navy ${
              t.href === active ? "border-kth-blue bg-white" : "border-transparent hover:bg-white/60"
            }`}
          >
            {t.label}
            {t.badge}
          </Link>
        ))}
      </nav>
    );
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`-mb-px inline-flex h-[42px] shrink-0 items-center gap-1.5 border-b-4 px-3.5 text-sm font-bold ${
            t.href === active ? "border-kth-blue text-kth-navy" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.badge}
        </Link>
      ))}
    </nav>
  );
}
