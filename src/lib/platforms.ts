/**
 * The kinds of devices publicomtools manages. Each platform has its own settings catalog
 * (the keys its software understands), its own base layer and its own profiles.
 * - linux: the publicom guest computers (catalog in kth-biblioteket/publicom)
 * - android: PubLiKiosk tablets (catalog in kth-biblioteket/publikiosk)
 * - tizen: Samsung signage screens running PubLiPlayer, signs only (catalog in kth-biblioteket/publiplayer)
 * No server-only import: used by client components too.
 */
export const PLATFORMS = ["linux", "android", "tizen"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = { linux: "Datorer (Linux)", android: "Android-enheter", tizen: "Tizen-skärmar" };
export const PLATFORM_SHORT: Record<Platform, string> = { linux: "Linux", android: "Android", tizen: "Tizen" };
/** What one and several devices of a platform are called in running text */
export const DEVICE_NOUN: Record<Platform, [string, string]> = {
  linux: ["dator", "datorer"],
  android: ["Android-enhet", "Android-enheter"],
  tizen: ["Tizen-skärm", "Tizen-skärmar"],
};
export const deviceNoun = (p: Platform, n: number) => DEVICE_NOUN[p][n === 1 ? 0 : 1];

/**
 * Whether a platform's devices are enrolled with a one-time code and get their own token
 * (Android, Tizen), rather than using the shared token and saying which host they are (Linux).
 * Enrolled devices also read their settings as JSON.
 */
export const enrolls = (p: Platform) => p !== "linux";

/** Signs only: no type to choose, the sign block is the whole settings page (Tizen) */
export const signageOnly = (p: Platform) => p === "tizen";

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

/** Unknown values (old rows) are treated as linux. */
export function asPlatform(value: unknown): Platform {
  return isPlatform(value) ? value : "linux";
}

/** ConfigLayer.name of a platform's base layer. Linux keeps "" from before there were platforms. */
export function baseName(platform: Platform): string {
  return platform === "linux" ? "" : platform;
}

/** Settings target of a platform's base layer: "base" (linux) or "base:android". */
export function baseTarget(platform: Platform): string {
  return platform === "linux" ? "base" : `base:${platform}`;
}

/** The platform of a base target, or null if it isn't one. */
export function baseTargetPlatform(target: string): Platform | null {
  if (target === "base") return "linux";
  if (target.startsWith("base:") && isPlatform(target.slice(5))) return target.slice(5) as Platform;
  return null;
}
