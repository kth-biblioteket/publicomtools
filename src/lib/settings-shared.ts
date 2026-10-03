/**
 * Shared by the settings form (client) and its server action: the catalog entry
 * shape, per-value validation and how values are shown in Swedish. No server-only
 * imports here.
 */

export type KeyType = "int" | "bool" | "string" | "csv" | "url" | "enum";

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
};

export type Group = { id: string; label: string };

/** "base" | "profile:<name>" | "host:<host>" */
export type Target = string;

/** A change as saved in ConfigChange.changes. null = not set in the layer. "__profile" = a computer's profile. */
export type Change = { key: string; before: string | null; after: string | null };

export const PROFILE_KEY = "__profile";

/** Why a value can't be saved, or null. */
export function validateValue(meta: Pick<CatalogEntry, "type" | "options">, value: string): string | null {
  if (value.includes('"')) return "Får inte innehålla dubbelcitattecken (\").";
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
    default:
      return null;
  }
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
    default:
      return value || "tomt";
  }
}

export function targetLabel(target: Target, names?: { host?: string | null }): string {
  if (target === "base") return "Grundinställningar";
  if (target.startsWith("profile:")) return `Profil ${target.slice(8)}`;
  return names?.host || target.slice(5);
}

export type SettingWarning = { key: string; message: string };

/**
 * Combinations that are allowed but probably not what you want. Shown as warnings in the
 * form and the review; they never block saving. `value` is the effective value of a key
 * as the editor shows it (own, drafted or inherited; null = not set anywhere).
 */
export function settingWarnings(value: (key: string) => string | null, catalog: Map<string, CatalogEntry>): SettingWarning[] {
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
  const resource = (value("RESOURCE_ID") ?? "").trim();
  if (type === "guestcomputer" && catalog.has("RESOURCE_ID") && (!resource || resource === "x"))
    warnings.push({
      key: "RESOURCE_ID",
      message: "Gästdatorn har inget riktigt resurs-id. Bokningen när någon loggar in fungerar inte förrän datorn finns i bokningssystemet och har sitt id här.",
    });
  return warnings;
}
