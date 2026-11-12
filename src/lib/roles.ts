import { INFO_FIELD_KEYS, PROFILE_KEY } from "@/lib/settings-shared";
import { SIGN_PAGES_KEY, SIGN_SCHEDULE_KEY } from "@/lib/signage";

/**
 * Who may do what (shared by the server checks and the UI). Higher roles can do everything the lower
 * ones can:
 * - innehall: content on profiles and devices (sign, message line, first page texts and fields),
 *   the media library, reload and screenshot
 * - redaktor: every setting on profiles and devices, profiles, restart and rename
 * - it: everything, also the base settings, the catalog, guest sessions and adding/removing devices
 */
export type Role = "innehall" | "redaktor" | "it";

const RANK: Record<Role, number> = { innehall: 1, redaktor: 2, it: 3 };

export const ROLE_LABEL: Record<Role, string> = { innehall: "Innehåll", redaktor: "Redaktör", it: "IT" };

export function atLeast(role: Role | null, min: Role): boolean {
  return role !== null && RANK[role] >= RANK[min];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in RANK;
}

/** The settings the role Innehåll may change (on profiles and devices) */
export const CONTENT_KEYS = new Set<string>([
  SIGN_SCHEDULE_KEY,
  SIGN_PAGES_KEY,
  "SIGN_SECONDS",
  "SIGN_RELOAD",
  "LAUNCHER_TITLE",
  "LAUNCHER_TITLE_EN",
  "LAUNCHER_SUBTITLE",
  "LAUNCHER_SUBTITLE_EN",
  "LAUNCHER_FOOTER",
  "LAUNCHER_FOOTER_EN",
  ...INFO_FIELD_KEYS,
  "LAUNCHER_MESSAGE",
  "LAUNCHER_MESSAGE_EN",
  "LAUNCHER_MESSAGE_URL",
  "LAUNCHER_POLOPOLY_ID",
  "LAUNCHER_MESSAGE_STYLE",
  "LAUNCHER_MESSAGE_ICON",
]);

const isBase = (target: string) => target === "base" || target.startsWith("base:");

/** Whether the role may change the key (PROFILE_KEY = a device's profile) on the target */
export function canEditKey(role: Role | null, target: string, key: string): boolean {
  if (atLeast(role, "it")) return true;
  if (isBase(target) || !atLeast(role, "innehall")) return false;
  if (atLeast(role, "redaktor")) return true;
  return key !== PROFILE_KEY && CONTENT_KEYS.has(key);
}

/** null when the role may make the change, else why not (shown to the user) */
export function settingsDenied(role: Role | null, target: string, keys: string[]): string | null {
  if (isBase(target) && !atLeast(role, "it")) return "Grundinställningarna ändras av IT.";
  const denied = keys.filter((k) => !canEditKey(role, target, k));
  if (!denied.length) return null;
  const names = denied.map((k) => (k === PROFILE_KEY ? "profilen" : k)).join(", ");
  return `Du kan ändra innehåll (skylt, meddelanderad, förstasidans texter och fält) men inte ${names}. Be en redaktör eller IT.`;
}
