import "server-only";
import { db } from "@/lib/db";
import { asValues, type ConfigValues } from "@/lib/config";
import { baseName, baseTarget } from "@/lib/platforms";
import { displayName } from "@/lib/names";
import { saveSettings } from "@/lib/settings";
import { EMPTY_APP, parseApps, serializeApps, type AppEntry } from "@/lib/settings-shared";

/**
 * One-time move of the Android tablets' old home app (START_URL, START_LABEL, START_ICON, APP_SCOPE)
 * into APPS as the first service, the way PubLiKiosk 3.20 and the Linux kiosk work. PubLiKiosk 3.20
 * still puts START_URL first when its address is missing from APPS, so the move must give every
 * level – base, profiles and the single tablets – exactly the same tabs as before. Levels are handled
 * top-down: START_URL and APP_SCOPE are removed, and APPS is written only where the inherited list
 * would otherwise differ.
 */

const LEGACY = ["START_URL", "APP_SCOPE"] as const;

/** The service PubLiKiosk 3.20 puts first for an older setting, or null (same rule as the app). */
function legacyHome(v: ConfigValues, startIcon: string): AppEntry | null {
  const url = (v.START_URL ?? "").trim();
  if (!/^https:\/\/\S+$/.test(url)) return null;
  if (parseApps(v.APPS).some((a) => a.url.trim() === url || a.urlEn.trim() === url)) return null;
  const label = (v.START_LABEL ?? "").trim();
  return {
    ...EMPTY_APP,
    name: label || "Hem",
    nameEn: label ? "" : "Home",
    icon: (v.START_ICON ?? "").trim() || startIcon,
    scope: (v.APP_SCOPE ?? "").trim(),
    url,
  };
}

/** What the tablet shows: the tabs in app mode (old home first), the cards on the first page */
function services(v: ConfigValues, homeMode: string, startIcon: string): AppEntry[] {
  const apps = parseApps(v.APPS);
  const home = (v.HOME_MODE ?? homeMode) === "app" ? legacyHome(v, startIcon) : null;
  return home ? [home, ...apps] : apps;
}

const same = (a: AppEntry[], b: AppEntry[]) => serializeApps(a, true) === serializeApps(b, true);
const names = (list: AppEntry[]) => list.map((a) => a.name || "utan namn");

export type MigrationStep = {
  target: string;
  label: string;
  /** The level's own values of the keys that change, as they are now */
  before: Record<string, string | null>;
  set: Record<string, string>;
  unset: string[];
  /** Services as the tablets see them, before and after (the same by construction; shown for review) */
  servicesBefore: string[];
  servicesAfter: string[];
};

export type MigrationPlan = { steps: MigrationStep[]; checked: number; mismatches: string[] };

export type MigrationInput = {
  homeMode: string;
  startIcon: string;
  base: ConfigValues;
  profiles: { name: string; label: string; values: ConfigValues }[];
  computers: { host: string; label: string; profile: string | null; overrides: ConfigValues }[];
};

/** Pure: the steps for given levels (also used to test the rule without a database). */
export function planFromLevels({ homeMode, startIcon, base: baseValues, profiles: profileLevels, computers }: MigrationInput): MigrationPlan {
  const steps: MigrationStep[] = [];
  const mismatches: string[] = [];
  let checked = 0;

  /** One level: own values, and the merged values above it before and after the move */
  const level = (target: string, label: string, own: ConfigValues, aboveBefore: ConfigValues, aboveAfter: ConfigValues) => {
    const effBefore = { ...aboveBefore, ...own };
    const wanted = services(effBefore, homeMode, startIcon);
    const newOwn: ConfigValues = { ...own };
    for (const k of LEGACY) delete newOwn[k];
    let effAfter = { ...aboveAfter, ...newOwn };
    // Skiljer sig det ärvda resultatet (en ny lista ovanför, eller förstasida som inte ska få startsidan som kort)
    // skrivs listan som enheterna ser i dag på den här nivån
    if (!same(services(effAfter, homeMode, startIcon), wanted)) {
      newOwn.APPS = serializeApps(wanted);
      effAfter = { ...aboveAfter, ...newOwn };
    }
    checked++;
    if (!same(services(effAfter, homeMode, startIcon), wanted)) mismatches.push(label);

    const set: Record<string, string> = {};
    if (newOwn.APPS !== undefined && newOwn.APPS !== own.APPS) set.APPS = newOwn.APPS;
    const unset = LEGACY.filter((k) => k in own);
    if (Object.keys(set).length || unset.length) {
      const before: Record<string, string | null> = {};
      for (const k of [...Object.keys(set), ...unset]) before[k] = own[k] ?? null;
      steps.push({
        target,
        label,
        before,
        set,
        unset,
        servicesBefore: names(wanted),
        servicesAfter: names(services(effAfter, homeMode, startIcon)),
      });
    }
    return { effBefore, effAfter };
  };

  const base = level(baseTarget("android"), "Grundinställningar Android", baseValues, {}, {});
  const profiles = new Map<string, { effBefore: ConfigValues; effAfter: ConfigValues }>();
  for (const p of profileLevels) profiles.set(p.name, level(`profile:${p.name}`, `Profil ${p.label}`, p.values, base.effBefore, base.effAfter));
  for (const c of computers) {
    const above = (c.profile && profiles.get(c.profile)) || base;
    level(`host:${c.host}`, c.label, c.overrides, above.effBefore, above.effAfter);
  }
  return { steps, checked, mismatches };
}

export async function planAndroidHomeMigration(): Promise<MigrationPlan> {
  const [baseRow, profileRows, computers, keys] = await Promise.all([
    db.configLayer.findUnique({ where: { kind_name: { kind: "base", name: baseName("android") } } }),
    db.configLayer.findMany({ where: { kind: "profile", platform: "android" }, orderBy: { name: "asc" } }),
    db.computer.findMany({
      where: { platform: "android" },
      select: { host: true, label: true, computerName: true, profile: true, overrides: true },
      orderBy: { host: "asc" },
    }),
    db.configKey.findMany({ where: { platform: "android", key: { in: ["HOME_MODE", "START_ICON"] } } }),
  ]);
  return planFromLevels({
    homeMode: keys.find((k) => k.key === "HOME_MODE")?.defaultValue ?? "app",
    startIcon: keys.find((k) => k.key === "START_ICON")?.defaultValue ?? "house",
    base: asValues(baseRow?.values),
    profiles: profileRows.map((p) => ({ name: p.name, label: p.label || p.name, values: asValues(p.values) })),
    computers: computers.map((c) => ({ host: c.host, label: displayName(c), profile: c.profile, overrides: asValues(c.overrides) })),
  });
}

export type MigrationResult = { ok: true; saved: number } | { ok: false; saved: number; error: string };

/** Saves the plan level by level (base first), each as an ordinary change in the history. */
export async function applyAndroidHomeMigration(changedBy: string): Promise<MigrationResult> {
  const plan = await planAndroidHomeMigration();
  if (plan.mismatches.length)
    return { ok: false, saved: 0, error: `Flytten ger inte samma tjänster för: ${plan.mismatches.join(", ")}. Inget har ändrats.` };
  let saved = 0;
  for (const s of plan.steps) {
    const res = await saveSettings(
      s.target,
      { set: s.set, unset: s.unset, before: s.before, note: "Startsidan blir första tjänst (PubLiKiosk 3.20)" },
      changedBy
    );
    if (!res.ok) return { ok: false, saved, error: `${s.label}: ${res.error}` };
    saved++;
  }
  return { ok: true, saved };
}
