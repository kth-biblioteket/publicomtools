/**
 * The kinds of devices publicomtools manages. Each platform has its own settings catalog
 * (the keys its software understands), its own base layer and its own profiles.
 * - linux: the publicom guest computers (catalog in kth-biblioteket/publicom)
 * - android: PubLiKiosk tablets (catalog in kth-biblioteket/publikiosk)
 * No server-only import: used by client components too.
 */
export const PLATFORMS = ["linux", "android"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = { linux: "Datorer (Linux)", android: "Android-enheter" };
export const PLATFORM_SHORT: Record<Platform, string> = { linux: "Linux", android: "Android" };

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
