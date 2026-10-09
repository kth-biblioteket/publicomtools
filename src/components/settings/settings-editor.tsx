"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { SettingsData } from "@/lib/settings";
import { saveSettingsAction } from "@/app/(admin)/settings-actions";
import { formatValue, PROFILE_KEY, settingWarnings, validateValue, type CatalogEntry } from "@/lib/settings-shared";
import { Chip } from "@/components/ui/chip";
import { SearchIcon } from "@/components/ui/icons";
import { AppsEditor, type EditorField } from "./apps-editor";
import { FieldControl } from "./field-control";
import { KeyPicker } from "./key-picker";
import { PasteImport } from "./paste-import";

type Kind = "base" | "profile" | "host";
type Source = "base" | "profile";
type Inherited = Record<string, { value: string; source: Source }>;
/** key → new value, or null = remove from this layer */
type Drafts = Record<string, string | null>;

const LINK = "text-[12.5px] font-semibold text-kth-blue underline underline-offset-2 hover:text-select-ink";
/**
 * Edited in the apps editor together with the apps key (Android): what the tablet starts with, the
 * first page's texts, and the home app's address, name and icon
 */
const HOME_KEYS = ["HOME_MODE", "LAUNCHER_TITLE", "LAUNCHER_SUBTITLE", "LAUNCHER_FOOTER", "START_URL", "START_LABEL", "START_ICON"];

function kindOf(target: string): Kind {
  return target === "base" || target.startsWith("base:") ? "base" : target.startsWith("profile:") ? "profile" : "host";
}

export function SettingsEditor({ data, title }: { data: SettingsData; title: string }) {
  const router = useRouter();
  const kind = kindOf(data.target);
  const meta = useMemo(() => new Map(data.catalog.map((k) => [k.key, k])), [data.catalog]);

  const [drafts, setDrafts] = useState<Drafts>({});
  const [profileDraft, setProfileDraft] = useState<string | null | undefined>(undefined);
  /** The computer's own values removed because of the profile switch (undone with it) */
  const [clearedBySwitch, setClearedBySwitch] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** Keys brought into view with "Ändra en inställning…" */
  const [pinned, setPinned] = useState<string[]>([]);
  const [mode, setMode] = useState<"form" | "text">("form");
  const [review, setReview] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const profileName = kind === "host" ? (profileDraft !== undefined ? profileDraft : data.profile) : null;

  const inheritedFor = (profile: string | null): Inherited => {
    if (kind === "base") return {};
    const out: Inherited = {};
    for (const [k, v] of Object.entries(data.base)) out[k] = { value: v, source: "base" };
    if (kind === "host" && profile && data.profiles[profile])
      for (const [k, v] of Object.entries(data.profiles[profile])) out[k] = { value: v, source: "profile" };
    return out;
  };
  const inherited = inheritedFor(profileName);

  const ownNow = (key: string): string | null => (key in drafts ? drafts[key] : data.own[key] ?? null);
  const shown = (key: string): string | null => ownNow(key) ?? inherited[key]?.value ?? null;

  const draftCount = Object.keys(drafts).length + (profileDraft !== undefined ? 1 : 0);

  useEffect(() => {
    if (!draftCount) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftCount]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const update = (fn: (d: Drafts) => void) =>
    setDrafts((prev) => {
      const next = { ...prev };
      fn(next);
      return next;
    });

  const setValue = (key: string, value: string) =>
    update((d) => {
      const saved = data.own[key] ?? null;
      if (saved === value || (saved === null && inherited[key]?.value === value)) delete d[key];
      else d[key] = value;
    });
  /** Stop setting it here: inherit again (or fall back to the program's default in base). */
  const reset = (key: string) =>
    update((d) => {
      if (key in data.own) d[key] = null;
      else delete d[key];
    });
  const undo = (key: string) => update((d) => delete d[key]);

  const sourceText = (s: Source) => (s === "base" ? "grundinställningarna" : `profilen ${data.profileLabels[profileName ?? ""] ?? profileName}`);

  // --- which rows to show ---
  const needle = q.trim().toLowerCase();
  const isOwn = (key: string) => ownNow(key) !== null;
  const visible = (k: CatalogEntry) =>
    (showAdvanced || !k.advanced || isOwn(k.key) || k.key in drafts || pinned.includes(k.key)) &&
    (!onlyOwn || isOwn(k.key) || k.key in drafts || pinned.includes(k.key)) &&
    (!needle || `${k.label} ${k.key} ${k.help ?? ""}`.toLowerCase().includes(needle));
  const hiddenAdvanced = data.catalog.filter((k) => k.advanced && !isOwn(k.key) && !(k.key in drafts)).length;
  // The apps editor (APPS, type apps) takes the place of the home app's rows: one block where the
  // first of them would be
  const appsKey = data.catalog.find((k) => k.type === "apps");
  const combine = (keys: CatalogEntry[]) => {
    if (!appsKey) return keys;
    const grouped = (k: CatalogEntry) => k.key === appsKey.key || HOME_KEYS.includes(k.key);
    const at = keys.findIndex(grouped);
    return at < 0 ? keys : [...keys.slice(0, at), appsKey, ...keys.slice(at).filter((k) => !grouped(k))];
  };
  const groups = data.groups
    .map((g) => ({ ...g, keys: combine(data.catalog.filter((k) => k.group === g.id && visible(k))) }))
    .filter((g) => g.keys.length);
  const unknownKeys = Object.keys(data.own).filter((k) => !meta.has(k) && (!needle || k.toLowerCase().includes(needle)));
  const ownCount = new Set([...Object.keys(data.own), ...Object.keys(drafts)].filter(isOwn)).size;

  // --- review ---
  const changedKeys = Object.keys(drafts);
  const affected = data.computers.filter((c) => {
    if (kind === "host") return `host:${c.host}` === data.target;
    const touches = (k: string) =>
      !c.ownKeys.includes(k) && (kind === "profile" || !(c.profile && data.profiles[c.profile] && k in data.profiles[c.profile]));
    if (kind === "profile" && c.profile !== data.target.slice(8)) return false;
    return changedKeys.some(touches);
  });
  const inScope = kind === "base" ? data.computers : data.computers.filter((c) => kind === "profile" && c.profile === data.target.slice(8));
  const shielded = kind === "host" ? [] : inScope.filter((c) => !affected.includes(c));

  const clientIssues = Object.fromEntries(
    Object.entries(drafts)
      .filter(([k, v]) => v !== null && meta.has(k))
      .map(([k, v]) => [k, validateValue(meta.get(k)!, v!)] as const)
      .filter(([, p]) => p)
  ) as Record<string, string>;
  const issues = { ...serverIssues, ...clientIssues };
  const warnings = settingWarnings(shown, meta);
  const warningFor = (key: string) => warnings.find((w) => w.key === key)?.message;

  const save = () => {
    const set: Record<string, string> = {};
    const unset: string[] = [];
    const before: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(drafts)) {
      before[k] = data.own[k] ?? null;
      if (v === null) unset.push(k);
      else set[k] = v;
    }
    if (profileDraft !== undefined) before[PROFILE_KEY] = data.profile;
    setError(null);
    startSaving(async () => {
      const res = await saveSettingsAction(data.target, {
        set,
        unset,
        before,
        ...(profileDraft !== undefined ? { profile: profileDraft } : {}),
        note,
      });
      if (!res.ok) {
        setError(res.error);
        setServerIssues(Object.fromEntries((res.issues ?? []).map((i) => [i.key, i.problem])));
        return;
      }
      const n = affected.length;
      setDrafts({});
      setProfileDraft(undefined);
      setClearedBySwitch([]);
      setNote("");
      setReview(false);
      setServerIssues({});
      setToast(
        kind === "host"
          ? `Sparat. ${title} får ändringarna vid nästa omstart.`
          : `Sparat. ${n} ${n === 1 ? "dator" : "datorer"} får ändringen vid nästa omstart.`
      );
      router.refresh();
    });
  };

  // --- the apps editor ---
  const field = (key: string): EditorField | undefined => {
    const m = meta.get(key);
    if (!m) return undefined;
    const value = shown(key);
    return {
      meta: m,
      value,
      inherited: ownNow(key) === null && value !== null,
      problem: issues[key],
      onChange: (v) => setValue(key, v),
      onClear: () => reset(key),
    };
  };
  const appsRow = (k: CatalogEntry, first: boolean) => {
    const keys = [k.key, ...HOME_KEYS.filter((h) => meta.has(h))];
    const drafted = keys.filter((h) => h in drafts);
    const own = ownNow(k.key);
    const inh = inherited[k.key];
    return (
      <div key={k.key} className={`flex flex-col gap-3 px-5 py-4 ${first ? "" : "border-t border-line-soft"} ${drafted.length ? "bg-draft" : ""}`}>
        <div>
          <span className="text-sm font-bold">{meta.has("HOME_MODE") ? "Start och webbappar" : "Webbappar"}</span>
          <span className="ml-1.5 font-mono text-[11px] text-faint">{keys.join(" · ")}</span>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            {meta.has("HOME_MODE")
              ? "Välj vad besökaren ser först och vilka webbappar enheten har. Dra i handtaget för att ändra ordningen."
              : "Enheten visar en webbapp i taget. Har den fler än en visas en knapp per app längst ner, och besökaren byter med ett tryck. Dra i handtaget för att ändra ordningen."}
          </p>
        </div>
        <AppsEditor
          apps={field(k.key)!}
          homeUrl={field("START_URL")}
          homeLabel={field("START_LABEL")}
          homeIcon={field("START_ICON")}
          homeMode={field("HOME_MODE")}
          launcherTitle={field("LAUNCHER_TITLE")}
          launcherSubtitle={field("LAUNCHER_SUBTITLE")}
          launcherFooter={field("LAUNCHER_FOOTER")}
        />
        {keys.map((h) => warningFor(h)).filter(Boolean).map((w) => (
          <p key={w} className="rounded-md bg-warn-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-warn-ink">{w}</p>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          {drafted.length > 0 && <Chip tone="draft">Osparad</Chip>}
          {own !== null ? (
            <>
              <Chip tone="own">{kind === "base" ? "Appar satta" : kind === "profile" ? "Appar satta i profilen" : "Appar satta här"}</Chip>
              <button type="button" className={LINK} onClick={() => reset(k.key)}>
                {inh ? `Använd ärvda appar (${formatValue(k, inh.value)})` : "Ta bort alla appar"}
              </button>
            </>
          ) : inh ? (
            <Chip>Appar från {sourceText(inh.source)}</Chip>
          ) : null}
          {drafted.length > 0 && (
            <button type="button" className={LINK} onClick={() => update((d) => drafted.forEach((h) => delete d[h]))}>
              Ångra
            </button>
          )}
        </div>
      </div>
    );
  };

  // --- a row ---
  const row = (k: CatalogEntry, first: boolean) => {
    if (k.type === "apps") return appsRow(k, first);
    const own = ownNow(k.key);
    const inh = inherited[k.key];
    const drafted = k.key in drafts;
    const value = shown(k.key);
    const problem = issues[k.key];
    return (
      <div
        key={k.key}
        className={`grid gap-x-6 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] ${first ? "" : "border-t border-line-soft"} ${drafted ? "bg-draft" : ""}`}
      >
        <div>
          <label htmlFor={`f-${k.key}`} className="text-sm font-bold">
            {k.label}
          </label>
          {k.advanced && <span className="ml-1.5 align-middle"><Chip tone="it">IT</Chip></span>}
          <span className="ml-1.5 font-mono text-[11px] text-faint">{k.key}</span>
          {k.help && <p className="mt-0.5 text-[13px] leading-snug text-muted">{k.help}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldControl
            meta={k}
            value={value}
            inherited={own === null && value !== null}
            invalid={!!problem}
            onChange={(v) => setValue(k.key, v)}
            onClear={() => reset(k.key)}
          />
          {problem && <p className="text-[12.5px] font-semibold text-bad-ink">{problem}</p>}
          {!problem && warningFor(k.key) && (
            <p className="rounded-md bg-warn-bg px-2.5 py-1.5 text-[12.5px] font-semibold text-warn-ink">{warningFor(k.key)}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            {drafted && <Chip tone="draft">Osparad</Chip>}
            {own !== null ? (
              <>
                <Chip tone="own">{kind === "base" ? "Satt" : kind === "profile" ? "Satt i profilen" : "Satt här"}</Chip>
                <button type="button" className={LINK} onClick={() => reset(k.key)}>
                  {inh
                    ? `Använd ärvt värde (${formatValue(k, inh.value)})`
                    : k.defaultValue !== null
                      ? `Ta bort (standard: ${formatValue(k, k.defaultValue)})`
                      : "Ta bort"}
                </button>
              </>
            ) : inh ? (
              <Chip>Från {sourceText(inh.source)}</Chip>
            ) : (
              <span>
                Inte satt.
                {k.defaultValue !== null ? ` Programmets standard gäller (${formatValue(k, k.defaultValue)}).` : ""}
              </span>
            )}
            {drafted && (
              <button type="button" className={LINK} onClick={() => undo(k.key)}>
                Ångra
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // --- profile switch (computers) ---
  // The computer's own values were mostly set for the old profile, so a switch removes them, except
  // keys that belong to the computer itself (perComputer in the catalog: name, resource id …).
  const ownKeys = Object.keys(data.own).sort(
    (a, b) => (meta.get(a)?.label ?? a).localeCompare(meta.get(b)?.label ?? b, "sv")
  );
  const switchProfile = (next: string | null | undefined) => {
    setProfileDraft(next);
    if (next === undefined) {
      update((d) => clearedBySwitch.forEach((k) => d[k] === null && delete d[k]));
      setClearedBySwitch([]);
    } else if (profileDraft === undefined) {
      const clear = ownKeys.filter((k) => !meta.get(k)?.perComputer && !(k in drafts));
      update((d) => clear.forEach((k) => (d[k] = null)));
      setClearedBySwitch(clear);
    }
  };
  const ownValuesOnSwitch = () => (
    <div className="mt-3 rounded-[10px] border border-line-soft bg-[#fafbfc] px-3.5 py-3">
      <div className="text-[13.5px] font-bold">Datorns egna värden</div>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Ibockade tas bort, så att datorn får värdet från den nya profilen. Det som hör till just den här datorn står kvar.
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ownKeys.map((k) => {
          const m = meta.get(k);
          const removed = drafts[k] === null;
          const next = inherited[k]?.value ?? null;
          return (
            <li key={k} className="text-[13px]">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={removed}
                  onChange={(e) => (e.target.checked ? reset(k) : undo(k))}
                  className="mt-[3px]"
                />
                <span>
                  <b>{m?.label ?? k}</b>: <span className={removed ? "line-through text-muted" : ""}>{formatValue(m, data.own[k])}</span>
                  {removed ? (
                    <span className="text-muted"> → {next !== null ? formatValue(m, next) : m?.defaultValue != null ? `${formatValue(m, m.defaultValue)} (standard)` : "inte satt"}</span>
                  ) : m?.perComputer ? (
                    <span className="text-muted"> (hör till datorn)</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
  const profileImpact = (() => {
    if (kind !== "host" || profileDraft === undefined) return 0;
    const a = inheritedFor(data.profile), b = inheritedFor(profileDraft);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (k) => ownNow(k) === null && a[k]?.value !== b[k]?.value
    ).length;
  })();

  // --- text view ---
  const textView = () => {
    const keys = [...new Set([...Object.keys(inherited), ...Object.keys(data.own), ...Object.keys(drafts)])]
      .filter((k) => shown(k) !== null)
      .sort();
    return (
      <pre className="overflow-x-auto rounded-xl border border-line bg-white px-4 py-3.5 font-mono text-xs leading-7">
        {keys.map((k) => (
          <div key={k}>
            <span className="font-semibold text-select-ink">{k}</span>
            {`="${shown(k)}"`}
            <span className="text-faint">
              {"  # "}
              {ownNow(k) !== null ? (kind === "base" ? "satt" : "satt här") : `från ${sourceText(inherited[k].source)}`}
              {k in drafts ? " (osparad)" : ""}
            </span>
          </div>
        ))}
      </pre>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {kind === "host" && (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-white px-5 py-4 shadow-sm">
          <div className="min-w-[260px] flex-1">
            <div className="text-[15px] font-extrabold">Profil</div>
            <p className="mt-0.5 text-[13.5px] text-muted">
              Datorn får alla inställningar från profilen. Nedan ändrar du enstaka inställningar för just den här datorn.
            </p>
            {profileDraft !== undefined && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                <Chip tone="draft">Osparad</Chip>
                Bytet ändrar {profileImpact} {profileImpact === 1 ? "inställning" : "inställningar"}.
                <button type="button" className={LINK} onClick={() => switchProfile(undefined)}>Ångra</button>
              </p>
            )}
            {profileDraft !== undefined && ownKeys.length > 0 && ownValuesOnSwitch()}
          </div>
          <label htmlFor="profile" className="sr-only">Profil</label>
          <select
            id="profile"
            value={profileName ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              switchProfile(v === data.profile ? undefined : v);
            }}
            className="h-[38px] w-56 rounded-lg border border-field bg-white px-2.5 text-sm"
          >
            <option value="">Ingen profil</option>
            {Object.keys(data.profiles)
              .sort((a, b) => data.profileLabels[a].localeCompare(data.profileLabels[b], "sv"))
              .map((p) => (
                <option key={p} value={p}>{data.profileLabels[p]}</option>
              ))}
          </select>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-3 top-[11px] text-muted" />
          <label htmlFor="settings-q" className="sr-only">Sök inställning</label>
          <input
            id="settings-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök inställning"
            className="h-[38px] w-full rounded-lg border border-field bg-white pl-9 pr-3 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={onlyOwn} onChange={(e) => setOnlyOwn(e.target.checked)} />
          {kind === "base" ? "Visa bara satta" : kind === "profile" ? "Visa bara det profilen sätter" : "Visa bara ändrade här"} ({ownCount})
        </label>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
          Visa tekniska inställningar{!showAdvanced && hiddenAdvanced ? ` (${hiddenAdvanced})` : ""}
        </label>
        <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
        {mode === "form" ? (
          <KeyPicker
            catalog={data.catalog}
            groups={data.groups}
            label={kind === "host" ? "Ändra en inställning för datorn" : "Ändra en inställning"}
            isOwn={(key) => isOwn(key)}
            describe={(key) => {
              const inh = inherited[key];
              const m = meta.get(key);
              return inh
                ? { now: formatValue(m, inh.value), source: `Från ${sourceText(inh.source)}` }
                : { now: m?.defaultValue != null ? formatValue(m, m.defaultValue) : "inte satt", source: "Programmets standard" };
            }}
            onPick={(key) => {
              setPinned((p) => (p.includes(key) ? p : [...p, key]));
              setQ("");
              setTimeout(() => {
                const el = document.getElementById(`f-${key}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.focus({ preventScroll: true });
              }, 50);
            }}
          />
        ) : (
          <PasteImport catalog={data.catalog} current={shown} onApply={(entries) => entries.forEach((e) => setValue(e.key, e.value))} />
        )}
        <div className="inline-flex gap-0.5 rounded-[9px] bg-[#eceef1] p-[3px]" role="group" aria-label="Visning">
          {(["form", "text"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`h-[30px] rounded-[7px] px-3 text-[13px] font-semibold ${mode === m ? "bg-white text-ink shadow-sm" : "text-[#3d444d]"}`}
            >
              {m === "form" ? "Formulär" : "Textläge"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {mode === "text" ? (
        textView()
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
          <nav className="sticky top-4 hidden flex-col gap-0.5 lg:flex" aria-label="Grupper">
            {groups.map((g) => {
              const n = g.keys.filter((k) => isOwn(k.key)).length;
              return (
                <a key={g.id} href={`#g-${g.id}`} className="flex justify-between rounded-md px-2.5 py-1.5 text-[13.5px] text-[#3d444d] hover:bg-white">
                  <span>{g.label}</span>
                  {kind !== "base" && n > 0 && <span className="text-xs font-extrabold text-select-ink">{n}</span>}
                </a>
              );
            })}
          </nav>
          <div className="flex min-w-0 flex-col gap-5">
            {groups.length === 0 && unknownKeys.length === 0 && (
              <div className="rounded-xl border border-line bg-white p-5 text-sm text-muted">Inga inställningar matchar.</div>
            )}
            {groups.map((g) => (
              <section key={g.id} id={`g-${g.id}`} className="scroll-mt-4">
                <h3 className="mb-2 text-[15px] font-extrabold">{g.label}</h3>
                <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                  {g.keys.map((k, i) => row(k, i === 0))}
                </div>
              </section>
            ))}
            {unknownKeys.length > 0 && (
              <section>
                <h3 className="mb-2 text-[15px] font-extrabold">Används inte längre</h3>
                <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                  {unknownKeys.map((k, i) => (
                    <div key={k} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm ${i ? "border-t border-line-soft" : ""} ${k in drafts ? "bg-draft" : ""}`}>
                      <span className="font-mono text-[12.5px]">{k}=&quot;{data.own[k]}&quot;</span>
                      <span className="flex-1 text-[12.5px] text-muted">Finns inte i katalogen. Datorerna läser den inte.</span>
                      {k in drafts ? (
                        <button type="button" className={LINK} onClick={() => undo(k)}>Ångra</button>
                      ) : (
                        <button type="button" className={LINK} onClick={() => reset(k)}>Ta bort</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!showAdvanced && hiddenAdvanced > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-sm text-muted">
                <Chip tone="it">IT</Chip>
                <span className="flex-1">{hiddenAdvanced} tekniska inställningar är dolda.</span>
                <button type="button" className={LINK} onClick={() => setShowAdvanced(true)}>Visa tekniska inställningar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {draftCount > 0 && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-white px-4 py-3.5 shadow-[0_-6px_20px_rgba(0,0,0,.06)] sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          <span className="text-[15px] font-bold">
            {draftCount === 1 ? "1 osparad ändring" : `${draftCount} osparade ändringar`}
          </span>
          <span className="flex-1 text-[13.5px] text-muted">{title}</span>
          <button
            type="button"
            onClick={() => { setDrafts({}); setProfileDraft(undefined); setClearedBySwitch([]); setServerIssues({}); }}
            className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold"
          >
            Ångra alla
          </button>
          <button
            type="button"
            disabled={Object.keys(clientIssues).length > 0}
            onClick={() => { setError(null); setReview(true); }}
            className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white hover:bg-select-ink disabled:opacity-45"
          >
            Granska och spara
          </button>
        </div>
      )}

      {review && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(20,24,32,.45)] px-4 py-[10vh]"
          onKeyDown={(e) => e.key === "Escape" && !saving && setReview(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="review-h" className="flex w-full max-w-[600px] flex-col gap-3.5 rounded-2xl bg-white p-6 shadow-2xl">
            <div>
              <h2 id="review-h" className="text-xl font-extrabold">Granska ändringar</h2>
              <p className="mt-1 text-sm text-muted">{title}</p>
            </div>

            {profileDraft !== undefined && (
              <div className="rounded-[10px] border border-line-soft px-3.5 py-3 text-sm">
                <div className="font-bold">Profil</div>
                <dl className="mt-1.5 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[13.5px]">
                  <dt className="text-muted">Före</dt><dd>{data.profile ? data.profileLabels[data.profile] ?? data.profile : "ingen"}</dd>
                  <dt className="text-muted">Efter</dt><dd>{profileDraft ? data.profileLabels[profileDraft] ?? profileDraft : "ingen"}</dd>
                </dl>
              </div>
            )}
            {changedKeys.map((k) => {
              const m = meta.get(k);
              const before = data.own[k] ?? null;
              const after = drafts[k];
              const inh = inherited[k];
              const beforeText = before !== null ? formatValue(m, before) : inh ? `${formatValue(m, inh.value)} (ärvt)` : "inte satt";
              const afterText = after !== null ? formatValue(m, after) : inh ? `${formatValue(m, inh.value)} (ärvt)` : m?.defaultValue != null ? `programmets standard (${formatValue(m, m.defaultValue)})` : "inte satt";
              return (
                <div key={k} className="rounded-[10px] border border-line-soft px-3.5 py-3 text-sm">
                  <div className="font-bold">{m?.label ?? k}</div>
                  <dl className="mt-1.5 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[13.5px]">
                    <dt className="text-muted">Före</dt><dd className="break-words">{beforeText}</dd>
                    <dt className="text-muted">Efter</dt><dd className="break-words">{afterText}</dd>
                  </dl>
                  {issues[k] && <p className="mt-1.5 text-[12.5px] font-semibold text-bad-ink">{issues[k]}</p>}
                </div>
              );
            })}

            {warnings.length > 0 && (
              <div className="rounded-[10px] bg-warn-bg px-3 py-2.5 text-[13.5px] text-warn-ink">
                {warnings.map((w) => (
                  <p key={w.key}>{w.message}</p>
                ))}
              </div>
            )}

            {kind !== "host" && (
              <div className="flex flex-col gap-2">
                <div className="text-[15px] font-extrabold">
                  Påverkar {affected.length} av {inScope.length} {inScope.length === 1 ? "dator" : "datorer"}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {affected.map((c) => (
                    <span key={c.host} className="inline-flex h-[26px] items-center rounded-md bg-[#eceef1] px-2.5 text-[13px] font-semibold text-[#3d444d]">{c.name}</span>
                  ))}
                  {shielded.map((c) => (
                    <span key={c.host} className="inline-flex h-[26px] items-center rounded-md border border-dashed border-field px-2.5 text-[13px] font-semibold text-muted">
                      {c.name} · eget värde
                    </span>
                  ))}
                </div>
              </div>
            )}

            <label htmlFor="review-note" className="text-[13.5px] font-bold">
              Anteckning <span className="font-medium text-muted">(frivillig)</span>
            </label>
            <input
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Varför gör du ändringen?"
              maxLength={500}
              className="h-[38px] rounded-lg border border-field px-3 text-sm"
            />
            <div className="rounded-[10px] bg-select px-3 py-2.5 text-[13.5px] text-select-ink">
              {kind === "host" ? "Datorn hämtar" : "Datorerna hämtar"} de nya inställningarna nästa gång {kind === "host" ? "den" : "de"} startar om.
            </div>
            {error && <p role="alert" className="text-sm font-semibold text-bad-ink">{error}</p>}
            <div className="flex justify-end gap-2.5">
              <button type="button" disabled={saving} onClick={() => setReview(false)} className="h-9 rounded-lg border border-[#d7dbe0] bg-white px-3.5 text-[13.5px] font-semibold">
                Fortsätt redigera
              </button>
              <button type="button" disabled={saving} onClick={save} className="h-9 rounded-lg bg-kth-blue px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
                {saving ? "Sparar…" : "Spara ändringar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
