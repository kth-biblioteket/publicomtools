"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Health } from "@/lib/status";
import type { ConfigState } from "@/lib/computers";
import { HealthBadge } from "@/components/health-badge";
import { Chip } from "@/components/ui/chip";
import { PauseIcon, PlayIcon, SearchIcon } from "@/components/ui/icons";

export type ComputerRow = {
  host: string;
  name: string;
  /** The computer's own name, when the admin list shows another one */
  panelName: string | null;
  profile: string | null;
  health: Health;
  seen: string;
  problems: string[];
  configState: ConfigState;
};

type Filter = "all" | "action" | "offline" | "warning" | "pending";

const REFRESH_MS = 30_000;

function ConfigChip({ state }: { state: ConfigState }) {
  if (state === "pending") return <Chip tone="draft" title="Inställningar har ändrats efter att datorn senast startade">Väntar på omstart</Chip>;
  if (state === "legacy") return <Chip title="Datorn hämtar fortfarande sina inställningar från de gamla configfilerna på GitHub">Gamla configfiler</Chip>;
  return null;
}

function Todo({ problems }: { problems: string[] }) {
  if (!problems.length) return <span className="text-faint">–</span>;
  return (
    <span>
      {problems[0]}
      {problems.length > 1 && <span className="text-muted"> +{problems.length - 1} till</span>}
    </span>
  );
}

export function ComputerList({ rows, renderedAt }: { rows: ComputerRow[]; renderedAt: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [profile, setProfile] = useState("");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router, paused]);

  const counts = {
    all: rows.length,
    action: rows.filter((r) => r.health !== "ok").length,
    offline: rows.filter((r) => r.health === "offline").length,
    warning: rows.filter((r) => r.health === "warning").length,
    pending: rows.filter((r) => r.configState === "pending").length,
  };
  const profiles = useMemo(() => [...new Set(rows.map((r) => r.profile).filter((p): p is string => !!p))].sort(), [rows]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (filter === "all" ||
        (filter === "action" && r.health !== "ok") ||
        (filter === "pending" && r.configState === "pending") ||
        r.health === filter) &&
      (!profile || r.profile === profile) &&
      (!needle || `${r.name} ${r.panelName ?? ""} ${r.host} ${r.profile ?? ""}`.toLowerCase().includes(needle))
  );

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Alla" },
    { id: "offline", label: "Ingen kontakt" },
    { id: "warning", label: "Behöver tittas på" },
    ...(counts.pending ? [{ id: "pending" as const, label: "Väntar på omstart" }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-3 top-[11px] text-muted" />
          <label htmlFor="q" className="sr-only">Sök dator</label>
          <input
            id="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök namn eller värdnamn"
            className="h-[38px] w-full rounded-lg border border-field bg-white pl-9 pr-3 text-sm"
          />
        </div>

        {/* Segmented filter on desktop, "Behöver åtgärd" shortcut on phones */}
        <div className="hidden gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px] md:inline-flex" role="group" aria-label="Filtrera på status">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold ${
                filter === f.id ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"
              }`}
            >
              {f.label} <span className="text-xs font-bold text-muted">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 md:hidden">
          {(["all", "action"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${
                filter === id ? "border-kth-blue bg-kth-blue text-white" : "border-[#d7dbe0] bg-white text-[#3d444d]"
              }`}
            >
              {id === "all" ? "Alla" : "Behöver åtgärd"} {counts[id]}
            </button>
          ))}
        </div>

        {profiles.length > 1 && (
          <>
            <label htmlFor="profile" className="sr-only">Profil</label>
            <select
              id="profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="h-[38px] rounded-lg border border-field bg-white px-2.5 text-sm"
            >
              <option value="">Alla profiler</option>
              {profiles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </>
        )}

        <div className="flex items-center gap-2 text-[13px] text-muted lg:ml-auto">
          <span className={`size-[7px] rounded-full ${paused ? "bg-faint" : "bg-[#2e8540]"}`} aria-hidden="true" />
          {paused ? "Uppdateringen är pausad" : `Uppdateras var 30:e sekund · senast ${renderedAt}`}
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 font-semibold text-[#3d444d] hover:bg-white"
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "Fortsätt" : "Pausa"}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-sm">
          {rows.length === 0 ? (
            "Inga datorer än. En dator visas här efter sin första statusrapport."
          ) : (
            <>
              Inga datorer matchar.{" "}
              <button type="button" className="font-semibold text-kth-blue underline" onClick={() => { setQ(""); setFilter("all"); setProfile(""); }}>
                Visa alla
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="w-[26%] border-b border-line px-4 py-3">Dator</th>
                  <th className="w-[16%] border-b border-line px-4 py-3">Status</th>
                  <th className="w-[14%] border-b border-line px-4 py-3">Profil</th>
                  <th className="w-[14%] border-b border-line px-4 py-3">Senast kontakt</th>
                  <th className="border-b border-line px-4 py-3">Att göra</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.host} className={`border-b border-line-soft last:border-0 ${r.health === "offline" ? "bg-[#fffafa]" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/computers/${r.host}`} className="font-bold text-ink hover:text-kth-blue hover:underline">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-[12.5px] text-muted">
                        {r.host}
                        {r.panelName && <span className="font-sans"> · i panelen: {r.panelName}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><HealthBadge health={r.health} /></td>
                    <td className="px-4 py-3">{r.profile ?? "–"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.seen}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.problems.length > 0 && <Todo problems={r.problems} />}
                        <ConfigChip state={r.configState} />
                        {!r.problems.length && r.configState === "current" && <span className="text-faint">–</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: cards */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {shown.map((r) => (
              <Link
                key={r.host}
                href={`/computers/${r.host}`}
                className="flex flex-col gap-1.5 rounded-xl border border-line bg-white px-4 py-3.5 text-ink"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold">{r.name}</span>
                  <HealthBadge health={r.health} />
                </span>
                <span className="font-mono text-[12.5px] text-muted">
                  {r.host}
                  {r.profile ? ` · ${r.profile}` : ""} · {r.seen}
                </span>
                {r.problems.length > 0 && <span className="text-sm"><Todo problems={r.problems} /></span>}
                {r.configState !== "current" && <span><ConfigChip state={r.configState} /></span>}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
