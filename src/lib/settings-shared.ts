/**
 * Shared by the settings form (client) and its server action: the catalog entry
 * shape, per-value validation and how values are shown in Swedish. No server-only
 * imports here.
 */

/** apps: the Android tablets' extra web apps (APPS), edited with the apps editor */
export type KeyType = "int" | "bool" | "string" | "csv" | "url" | "enum" | "apps";

export type CatalogEntry = {
  key: string;
  label: string;
  group: string;
  type: KeyType;
  options: { value: string; label: string }[];
  unit: string | null;
  separator: string;
  defaultValue: string | null;
  help: string | null;
  example: string | null;
  advanced: boolean;
  /** Belongs to the single computer (name, resource id …): kept when it changes profile */
  perComputer: boolean;
};

export type Group = { id: string; label: string };

/** "base" (Linux) | "base:<platform>" | "profile:<name>" | "host:<host>" */
export type Target = string;

/** A change as saved in ConfigChange.changes. null = not set in the layer. "__profile" = a computer's profile. */
export type Change = { key: string; before: string | null; after: string | null };

export const PROFILE_KEY = "__profile";

/**
 * Why a value can't be saved, or null. Every character is allowed. platform: the Linux computers get
 * their settings as one KEY="value" line each (read verbatim by load_config, see publicom
 * config_lib.sh), so a line break can't be part of a value there; the Android tablets get JSON.
 * (Requires publicom's init.sh with the format check instead of bash -n, which rejected the whole
 * file for a value with an odd number of ".)
 */
export function validateValue(meta: Pick<CatalogEntry, "type" | "options">, value: string, platform?: string): string | null {
  if (platform !== "android" && /[\r\n]/.test(value)) return "Får inte innehålla radbrytningar.";
  switch (meta.type) {
    case "int":
      return /^-?\d+$/.test(value) ? null : "Skriv ett heltal.";
    case "bool":
      return value === "true" || value === "false" ? null : "Måste vara på eller av.";
    case "url":
      return !value || /^https?:\/\//.test(value) ? null : "Adressen måste börja med https:// eller http://.";
    case "enum":
      return !value || meta.options.some((o) => o.value === value)
        ? null
        : `Måste vara ett av: ${meta.options.map((o) => o.label).join(", ")}.`;
    case "apps": {
      // Högst sex (förstasidan); med En app visar enheten fem utöver startsidan (en varning, settingWarnings)
      const apps = parseApps(value);
      if (apps.length > MAX_APPS_LAUNCHER) return `Högst ${MAX_APPS_LAUNCHER} appar.`;
      const bad = apps.map((a, i) => [i, appProblems(a)] as const).find(([, p]) => Object.keys(p).length);
      if (!bad) return null;
      const [i, p] = bad;
      return `App ${i + 1}${apps[i].name ? ` (${apps[i].name})` : ""}: ${p.name ?? p.url ?? p.icon ?? p.desc ?? p.nameEn ?? p.descEn ?? p.scope}`;
    }
    default:
      return null;
  }
}

// --- APPS: the Android tablets' extra web apps ---

/** HOME_MODE=app: the tablet shows the home app (START_URL) and at most this many more */
export const MAX_APPS = 5;
/** HOME_MODE=launcher: at most this many services on the first page */
export const MAX_APPS_LAUNCHER = 6;

/** The icons the tablet has (Lucide names), with their names in the admin */
export const APP_ICONS = [
  { value: "house", label: "Hus" },
  { value: "search", label: "Sök" },
  { value: "map", label: "Karta" },
  { value: "map-pin", label: "Kartnål" },
  { value: "calendar", label: "Kalender" },
  { value: "book-open", label: "Bok" },
  { value: "library", label: "Bibliotek" },
  { value: "info", label: "Information" },
  { value: "circle-help", label: "Hjälp" },
  { value: "printer", label: "Skrivare" },
  { value: "monitor", label: "Dator" },
  { value: "user", label: "Person" },
  { value: "clock", label: "Klocka" },
  { value: "graduation-cap", label: "Studentmössa" },
] as const;

/**
 * desc: one line under the name on the first page's card (HOME_MODE=launcher). nameEn, descEn:
 * the same in English when the visitor chose English (empty: the Swedish text).
 */
export type AppEntry = { name: string; url: string; icon: string; scope: string; desc: string; nameEn: string; descEn: string };

const APP_FIELDS = ["name", "url", "icon", "scope", "desc", "nameEn", "descEn"] as const;

/**
 * APPS as the tablet reads it, in one of two forms:
 * - one entry per line (commas only when there is no line break), each
 *   "Namn|https://adress/|ikon|område|beskrivning|namn_en|beskrivning_en" (all but name and address
 *   optional);
 * - a JSON array of {name, url, icon, scope, desc, nameEn, descEn}, written when a text contains a
 *   character the line form can't carry (| , " or a line break), so that every character works in
 *   names and descriptions. The tablet reads it from PubLiKiosk 3.14.0.
 * Tolerant of older values: an entry without | that looks like an address becomes an app without a
 * name, so it is shown with an error instead of being lost.
 */
export function parseApps(value: string | null | undefined): AppEntry[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const list: unknown = JSON.parse(trimmed);
      if (Array.isArray(list))
        return list.map((o) => {
          const rec = o && typeof o === "object" ? (o as Record<string, unknown>) : {};
          const str = (k: string) => (typeof rec[k] === "string" ? (rec[k] as string) : "");
          return Object.fromEntries(APP_FIELDS.map((k) => [k, str(k)])) as AppEntry;
        });
    } catch {
      // Inte JSON trots allt: läs som rader nedan, så visas felen i stället för att posterna försvinner
    }
  }
  return value
    .split(value.includes("\n") ? "\n" : ",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("|").map((p) => p.trim());
      const empty = { icon: "", scope: "", desc: "", nameEn: "", descEn: "" };
      if (parts.length === 1 && /^[a-z]+:\/\//i.test(parts[0])) return { ...empty, name: "", url: parts[0] };
      return {
        name: parts[0] ?? "",
        url: parts[1] ?? "",
        icon: parts[2] ?? "",
        scope: parts[3] ?? "",
        desc: parts[4] ?? "",
        nameEn: parts[5] ?? "",
        descEn: parts[6] ?? "",
      };
    });
}

/**
 * One app per line, empty trailing parts left out; JSON when some text contains | , " or a line
 * break (see parseApps), so the tablets with older apps keep working as long as nobody uses them.
 * json: always JSON on one line (the Linux kiosk, where every setting is one line in .config; a
 * line break in a text becomes \n inside the JSON string).
 */
export function serializeApps(apps: AppEntry[], json = false): string {
  const clean = apps.map((a) => Object.fromEntries(APP_FIELDS.map((k) => [k, a[k].trim()])) as AppEntry);
  if (json || clean.some((a) => APP_FIELDS.some((k) => /[|,"\n]/.test(a[k]))))
    return JSON.stringify(clean.map((a) => Object.fromEntries(APP_FIELDS.filter((k) => a[k]).map((k) => [k, a[k]]))));
  return clean
    .map((a) => {
      const parts = APP_FIELDS.map((k) => a[k]);
      while (parts.length > 2 && !parts[parts.length - 1]) parts.pop();
      return parts.join("|");
    })
    .join("\n");
}

/** Why one app can't be saved, per field (empty = fine). Names and descriptions take any character. */
export function appProblems(a: AppEntry): Partial<Record<keyof AppEntry, string>> {
  const out: Partial<Record<keyof AppEntry, string>> = {};
  if (!a.name.trim()) out.name = "Skriv ett namn på knappen.";
  if (!/^https:\/\/[^\s/]+/.test(a.url.trim())) out.url = "Adressen måste börja med https://";
  else if (/\s/.test(a.url.trim())) out.url = "Adressen får inte innehålla mellanslag.";
  if (a.icon && !APP_ICONS.some((i) => i.value === a.icon)) out.icon = `Okänd ikon: ${a.icon}`;
  if (/\s/.test(a.scope.trim())) out.scope = "Området får inte innehålla mellanslag.";
  return out;
}

export function splitList(value: string, separator: string): string[] {
  return value
    .split(separator === " " ? /\s+/ : ",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinList(items: string[], separator: string): string {
  return items.join(separator === " " ? " " : ",");
}

// --- LAUNCHER_FIELD_1–4: the first page's information fields ---

/** One information field, "Etikett|typ|värde|Label" (type text, url or clock) */
export type InfoField = { label: string; type: string; value: string; labelEn: string };

export const INFO_FIELD_KEYS = ["LAUNCHER_FIELD_1", "LAUNCHER_FIELD_2", "LAUNCHER_FIELD_3", "LAUNCHER_FIELD_4"] as const;

export function parseInfoField(value: string | null | undefined): InfoField {
  const p = (value ?? "").split("|").map((x) => x.trim());
  return { label: p[0] ?? "", type: (p[1] ?? "").toLowerCase(), value: p[2] ?? "", labelEn: p[3] ?? "" };
}

/** "" when the field is empty (then it isn't set); empty trailing parts are left out */
export function serializeInfoField(f: InfoField): string {
  const parts = [f.label, f.type, f.type === "clock" ? "" : f.value, f.labelEn].map((x) => x.trim());
  if (!parts.some(Boolean)) return "";
  while (parts.length > 2 && !parts[parts.length - 1]) parts.pop();
  return parts.join("|");
}

/**
 * Why the device would ignore the field (it shows only valid ones), or null. | separates the
 * parts of the line, so it can't be part of a text.
 */
export function infoFieldProblem(f: InfoField): string | null {
  if (!f.label && !f.type && !f.value && !f.labelEn) return null;
  if ([f.label, f.value, f.labelEn].some((x) => x.includes("|"))) return "Texterna får inte innehålla |.";
  if (f.type === "clock") return null;
  if (f.type === "text") return f.value ? null : "Skriv texten som ska visas.";
  if (f.type === "url") return /^https:\/\/[^\s/]+/.test(f.value) ? null : "Adressen måste börja med https://";
  return "Välj vad fältet visar.";
}

/** The host of an https address, or null */
export function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/\s:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** host is one of the allowed sites or a subdomain of one (kth.se allows apps.lib.kth.se) */
export function hostAllowed(host: string, allowed: string[]): boolean {
  return allowed.some((a) => {
    const h = (hostOf(a) ?? a.replace(/^\*\./, "").split("/")[0]).toLowerCase();
    return !!h && (host === h || host.endsWith(`.${h}`));
  });
}

/** A value as library staff read it: "På", "Stående (vänster)", "5 minuter", "3 st". */
export function formatValue(meta: CatalogEntry | undefined, value: string | null | undefined): string {
  if (value === null || value === undefined) return "inte satt";
  if (!meta) return value || "tomt";
  switch (meta.type) {
    case "bool":
      return value === "true" ? "På" : value === "false" ? "Av" : value;
    case "enum":
      return meta.options.find((o) => o.value === value)?.label ?? (value || "tomt");
    case "int":
      return meta.unit ? `${value} ${meta.unit}` : value;
    case "csv": {
      const items = splitList(value, meta.separator);
      return items.length ? items.join(", ") : "tom lista";
    }
    case "apps": {
      // Namn (adress utan https://, ikon): så att en ändrad adress eller ikon syns i granskningen och loggen
      const apps = parseApps(value);
      if (!apps.length) return "inga";
      return apps
        .map((a) => {
          const where = a.url.replace(/^https:\/\//, "").replace(/\/$/, "");
          const icon = APP_ICONS.find((i) => i.value === a.icon)?.label ?? (a.icon || "ingen ikon");
          const english = [a.nameEn, a.descEn && `”${a.descEn}”`].filter(Boolean).join(" ");
          return `${a.name || "utan namn"} (${[where, icon, a.scope && `område ${a.scope}`, a.desc && `”${a.desc}”`, english && `engelska: ${english}`].filter(Boolean).join(", ")})`;
        })
        .join(" · ");
    }
    default:
      return value || "tomt";
  }
}

export function targetLabel(target: Target, names?: { host?: string | null }): string {
  if (target === "base") return "Grundinställningar";
  if (target.startsWith("base:")) return `Grundinställningar ${target.slice(5)}`;
  if (target.startsWith("profile:")) return `Profil ${target.slice(8)}`;
  return names?.host || target.slice(5);
}

export type SettingWarning = { key: string; message: string };

/**
 * Combinations that are allowed but probably not what you want. Shown as warnings in the
 * form and the review; they never block saving. `value` is the effective value of a key
 * as the editor shows it (own, drafted or inherited; null = not set anywhere).
 */
export function settingWarnings(
  value: (key: string) => string | null,
  catalog: Map<string, CatalogEntry>,
  platform?: string,
): SettingWarning[] {
  const warnings: SettingWarning[] = [];
  const saver = catalog.get("SCREENSAVER");
  const files = catalog.get("SCREENSAVER_FILES");
  if (saver && files) {
    const on = (value("SCREENSAVER") ?? saver.defaultValue) === "true";
    const list = splitList(value("SCREENSAVER_FILES") ?? "", files.separator);
    if (on && list.length === 0)
      warnings.push({
        key: "SCREENSAVER_FILES",
        message: "Skärmsläckaren är på men inga bilder är valda. Datorn visar då bara KTH-bakgrunden.",
      });
  }
  const type = value("COMPUTER_TYPE");
  if ((value("ALMA_LOGIN") ?? "false") === "true" && (type === "searchcomputer" || type === "signage"))
    warnings.push({
      key: "ALMA_LOGIN",
      message: `Inloggning krävs, men datortypen är ${type === "signage" ? "Skylt" : "Sökdator"}. Sökdatorer och skyltar visar ingen inloggningsskärm, så välj Datortyp Gästdator om datorn ska ha inloggning.`,
    });
  const interval = value("HEARTBEAT_INTERVAL");
  if (interval !== null && catalog.has("HEARTBEAT_INTERVAL") && !/^([1-9]|[1-5][0-9]|60)$/.test(interval.trim()))
    warnings.push({
      key: "HEARTBEAT_INTERVAL",
      message: "Statusrapport var: datorn förstår 1–60 minuter och använder 5 för andra värden.",
    });
  const appsMeta = [...catalog.values()].find((k) => k.type === "apps");
  if (appsMeta) {
    const apps = parseApps(value(appsMeta.key));
    const launcher = catalog.has("HOME_MODE") && (value("HOME_MODE") ?? catalog.get("HOME_MODE")!.defaultValue) === "launcher";
    // Android har en egen startsida (START_URL); på Linux-kiosken är tjänsterna allt
    const ownStart = catalog.has("START_URL");
    if (launcher && apps.length === 0)
      warnings.push({
        key: appsMeta.key,
        message: ownStart
          ? "Förstasidan har inga tjänster. Enheten visar då startsidan, som med En app."
          : "Kiosken har inga tjänster. Lägg till minst en.",
      });
    if (platform === "android" && (value(appsMeta.key) ?? "").trim().startsWith("["))
      warnings.push({
        key: appsMeta.key,
        message: "Någon text innehåller | , \" eller en radbrytning. Då sparas apparna i ett format som enheterna läser från PubLiKiosk 3.14.0. Äldre appar visar inga appar.",
      });
    if (ownStart && !launcher && apps.length > MAX_APPS)
      warnings.push({ key: appsMeta.key, message: `Med En app visar enheten högst ${MAX_APPS} appar utöver startsidan. Den sista hoppas över.` });
  }
  const resource = (value("RESOURCE_ID") ?? "").trim();
  if (type === "guestcomputer" && catalog.has("RESOURCE_ID") && (!resource || resource === "x"))
    warnings.push({
      key: "RESOURCE_ID",
      message: "Gästdatorn har inget riktigt resurs-id. Bokningen när någon loggar in fungerar inte förrän datorn finns i bokningssystemet och har sitt id här.",
    });
  return warnings;
}
