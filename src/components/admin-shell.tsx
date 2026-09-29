"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HistoryIcon, LayersIcon, MenuIcon, MonitorIcon, SlidersIcon, XIcon } from "@/components/ui/icons";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (path: string) => boolean };

const MAIN: NavItem[] = [
  { href: "/", label: "Datorer", icon: <MonitorIcon />, match: (p) => p === "/" || p.startsWith("/computers") },
  { href: "/config", label: "Profiler", icon: <LayersIcon />, match: (p) => p === "/config" || p.startsWith("/config/profiles") },
  { href: "/config/history/base", label: "Ändringslogg", icon: <HistoryIcon />, match: (p) => p.startsWith("/config/history") },
];
const IT: NavItem[] = [
  { href: "/config/base", label: "Grundinställningar", icon: <SlidersIcon />, match: (p) => p.startsWith("/config/base") },
];

function NavLink({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate: () => void }) {
  const active = item.match(path);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
        active ? "bg-select text-select-ink" : "text-muted hover:bg-page hover:text-ink"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

/** Sidebar layout shared with the Formtools admin: brand, main menu, IT section, user. */
export function AdminShell({
  userName,
  logout,
  children,
}: {
  userName: string;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const initials = userName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-kth-blue text-white">
          <MonitorIcon />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-extrabold">KTH Biblioteket</span>
          <span className="text-xs font-medium text-muted">Publika datorer</span>
        </span>
      </div>
      <nav className="flex flex-col gap-0.5 p-3" aria-label="Huvudmeny">
        {MAIN.map((i) => (
          <NavLink key={i.href} item={i} path={path} onNavigate={() => setOpen(false)} />
        ))}
        <div className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-faint">För IT</div>
        {IT.map((i) => (
          <NavLink key={i.href} item={i} path={path} onNavigate={() => setOpen(false)} />
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-kth-blue text-xs font-bold text-white">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-[13px] leading-snug">
          <span className="truncate font-bold">{userName}</span>
          <form action={logout}>
            <button type="submit" className="text-xs text-muted hover:text-ink hover:underline">
              Logga ut
            </button>
          </form>
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 bg-page text-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Stäng menyn" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85%] bg-white shadow-xl">
            <button
              type="button"
              aria-label="Stäng menyn"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 flex size-11 items-center justify-center text-muted"
            >
              <XIcon />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white px-2 lg:hidden">
          <button
            type="button"
            aria-label="Meny"
            onClick={() => setOpen(true)}
            className="flex size-11 items-center justify-center"
          >
            <MenuIcon className="size-5" />
          </button>
          <span className="font-extrabold">Publika datorer</span>
        </header>
        <main className="flex w-full max-w-[1180px] flex-1 flex-col px-4 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
