"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogEntry, Group } from "@/lib/settings-shared";
import { SearchIcon } from "@/components/ui/icons";

type Props = {
  catalog: CatalogEntry[];
  groups: Group[];
  /** "Nu: På" + "Från grundinställningarna" for a key */
  describe: (key: string) => { now: string; source: string };
  isOwn: (key: string) => boolean;
  onPick: (key: string) => void;
  label: string;
};

/** "Ändra en inställning…": find a setting by its Swedish name and bring it into view. */
export function KeyPicker({ catalog, groups, describe, isOwn, onPick, label }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = catalog.filter((k) => !needle || `${k.label} ${k.key} ${k.help ?? ""}`.toLowerCase().includes(needle));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13.5px] font-semibold ${
          open ? "border-kth-blue bg-select text-select-ink" : "border-[#d7dbe0] bg-white"
        }`}
      >
        <span aria-hidden="true" className="text-lg leading-none">+</span> {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Välj inställning"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute right-0 top-11 z-40 flex w-[min(470px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(0,0,0,.16)]"
        >
          <div className="relative border-b border-line-soft p-3">
            <SearchIcon className="absolute left-6 top-[23px] text-muted" />
            <label htmlFor="picker-q" className="sr-only">Sök inställning</label>
            <input
              id="picker-q"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sök, till exempel skärm eller utskrift"
              className="h-[38px] w-full rounded-lg border border-kth-blue pl-9 pr-3 text-sm"
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto px-1.5 pb-2">
            {groups.map((g) => {
              const keys = matches.filter((k) => k.group === g.id);
              if (!keys.length) return null;
              return (
                <div key={g.id}>
                  <div className="px-3.5 pb-0.5 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-faint">{g.label}</div>
                  {keys.map((k) => {
                    const own = isOwn(k.key);
                    const d = describe(k.key);
                    return (
                      <button
                        key={k.key}
                        type="button"
                        disabled={own}
                        onClick={() => {
                          onPick(k.key);
                          setOpen(false);
                          setQ("");
                        }}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-lg px-3.5 py-2 text-left hover:bg-select disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className={`text-sm font-bold ${own ? "text-faint" : ""}`}>{k.label}</span>
                        <span className={`inline-flex h-[22px] items-center rounded-md px-2 text-xs font-bold ${own ? "bg-select text-select-ink" : "bg-[#eceef1] text-[#3d444d]"}`}>
                          {own ? "Redan satt här" : `Nu: ${d.now}`}
                        </span>
                        {!own && <span className="col-span-2 truncate text-[12.5px] text-muted">{d.source}{k.help ? ` · ${k.help}` : ""}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!matches.length && <p className="px-3.5 py-3 text-sm text-muted">Ingen inställning matchar.</p>}
          </div>
          <div className="border-t border-line-soft bg-[#f8f9fa] px-4 py-3 text-[13px] leading-normal text-muted">
            Hittar du inte inställningen? Datorerna känner bara till de här. En ny inställning byggs in i publicom och läggs till i
            katalogen, sedan hämtas den under Inställningskatalog.
          </div>
        </div>
      )}
    </div>
  );
}
