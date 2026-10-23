"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookIcon, ChartIcon, HistoryIcon, ImageIcon, LayersIcon, MenuIcon, MonitorIcon, SlidersIcon, UsersIcon, XIcon } from "@/components/ui/icons";
import { PAGE_PAD } from "@/components/ui/page-header";
import kthLogo from "@/components/ui/kth-logo-blue.svg";

type NavItem = { href: string; label: string; icon: React.ReactNode; match: (path: string) => boolean };

const MAIN: NavItem[] = [
  { href: "/", label: "Enheter", icon: <MonitorIcon />, match: (p) => p === "/" || p.startsWith("/computers") },
  { href: "/stats", label: "Statistik", icon: <ChartIcon />, match: (p) => p.startsWith("/stats") },
  { href: "/config", label: "Profiler", icon: <LayersIcon />, match: (p) => p === "/config" || p.startsWith("/config/profiles") || p.startsWith("/config/history/profile") },
  { href: "/media", label: "Mediebibliotek", icon: <ImageIcon />, match: (p) => p.startsWith("/media") },
  { href: "/log", label: "Ändringslogg", icon: <HistoryIcon />, match: (p) => p.startsWith("/log") },
];
const IT: NavItem[] = [
  {
    href: "/config/base",
    label: "Grundinställningar",
    icon: <SlidersIcon />,
    match: (p) => p.startsWith("/config/base") || p.startsWith("/config/history/base") || p.startsWith("/config/android-home"),
  },
  { href: "/catalog", label: "Inställningskatalog", icon: <BookIcon />, match: (p) => p.startsWith("/catalog") },
  { href: "/guests", label: "Gästsessioner", icon: <UsersIcon />, match: (p) => p.startsWith("/guests") },
];

function NavLink({ item, path, onNavigate }: { item: NavItem; path: string; onNavigate: () => void }) {
  const active = item.match(path);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
        active ? "bg-kth-blue text-white" : "text-kth-navy hover:bg-white/70"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={kthLogo.src} alt="KTH" width={44} height={49} className="h-[49px] w-11 shrink-0" />
      <span className="flex flex-col border-l border-kth-navy/25 pl-3.5 leading-tight text-kth-navy">
        <span className="text-[13px] font-semibold text-kth-blue">KTH Biblioteket</span>
        <span className="text-[17px] font-extrabold">Publika enheter</span>
        <span className="text-[11.5px] font-semibold text-kth-navy/60">PubLiAdmin</span>
      </span>
    </Link>
  );
}

/** Light blue menu on the left with KTH's logo: main menu, IT section, user. */
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
      <div className="px-5 pb-5 pt-6">
        <Brand />
      </div>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Huvudmeny">
        {MAIN.map((i) => (
          <NavLink key={i.href} item={i} path={path} onNavigate={() => setOpen(false)} />
        ))}
        <div className="px-3 pb-1.5 pt-5 text-[11.5px] font-bold uppercase tracking-wider text-kth-blue">För IT</div>
        {IT.map((i) => (
          <NavLink key={i.href} item={i} path={path} onNavigate={() => setOpen(false)} />
        ))}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-3 border-t border-kth-navy/15 px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-kth-blue text-xs font-extrabold text-white">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-[13.5px] leading-snug text-kth-navy">
          <span className="truncate font-bold">{userName}</span>
          <form action={logout}>
            <button type="submit" className="font-semibold text-kth-blue hover:underline">
              Logga ut
            </button>
          </form>
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1 bg-white text-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto bg-kth-light-blue lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Stäng menyn" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85%] overflow-y-auto bg-kth-light-blue shadow-xl">
            <button
              type="button"
              aria-label="Stäng menyn"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-3 flex size-11 items-center justify-center text-kth-navy"
            >
              <XIcon />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 bg-kth-light-blue px-4 lg:hidden">
          <Brand />
          <button type="button" aria-label="Meny" onClick={() => setOpen(true)} className="flex size-11 items-center justify-center text-kth-navy">
            <MenuIcon className="size-5" />
          </button>
        </header>
        <main className={`${PAGE_PAD} flex w-full flex-1 flex-col pb-12`}>{children}</main>
      </div>
    </div>
  );
}
