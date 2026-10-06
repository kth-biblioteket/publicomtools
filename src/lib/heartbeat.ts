import "server-only";
import { z } from "zod";

/**
 * What publicom's /usr/local/bin/heartbeat.sh sends every 5 minutes (HEARTBEAT_INTERVAL changes it).
 * Everything except the identity fields is optional, so older and newer
 * client versions can report to the same server.
 */
export const heartbeatSchema = z.object({
  clientVersion: z.number().int(),
  host: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  hostname: z.string().min(1).max(253),
  profile: z.string().max(64).optional(),
  computerType: z.string().max(64).optional(),
  computerName: z.string().max(200).optional(),
  branch: z.string().max(100).optional(),
  deployedAt: z.string().max(40).optional(),
  deployFilesChanged: z.number().int().optional(),
  uptimeSeconds: z.number().int().nonnegative(),
  os: z.string().max(200).optional(),
  kernel: z.string().max(100).optional(),
  /** Linux: systemctl is-active guest.service. Android sends pageLoaded instead. */
  guestService: z.string().max(40).optional(),
  sessionStartedAt: z.string().max(40).optional(),
  guestRestarts: z.number().int().optional(),
  failedUnits: z.array(z.string().max(200)).max(50).default([]),
  rebootRequired: z.boolean().default(false),
  diskFreePercent: z.number().int().min(0).max(100).optional(),
  /** PUBLICOM_CONFIG_VERSION of the settings the running session started with */
  configVersion: z.string().max(64).optional(),
  /** Minutes between heartbeats (HEARTBEAT_INTERVAL as the computer applies it) */
  intervalMinutes: z.number().int().min(1).max(60).optional(),

  // Android (PubLiKiosk)
  platform: z.enum(["linux", "android"]).optional(),
  appVersion: z.string().max(40).optional(),
  model: z.string().max(100).optional(),
  webViewVersion: z.string().max(40).optional(),
  batteryPercent: z.number().int().min(0).max(100).optional(),
  charging: z.boolean().optional(),
  /** The start page has loaded (false = it failed, e.g. no network or a page error) */
  pageLoaded: z.boolean().optional(),
  /** Device owner and locked in kiosk mode */
  kioskLocked: z.boolean().optional(),
  /** The latest event in the settings menu, e.g. "PIN bytt 2026-10-05 21:03" or "upplåst från publicomtools …" */
  menuEvent: z.string().max(120).optional(),

  /**
   * Visits that ended since the last acknowledged heartbeat (epoch seconds). The device keeps them
   * until the answer has visitsAck=true; duplicates are ignored (host + start is unique).
   */
  visits: z
    .array(
      z.object({
        start: z.number().int().positive(),
        end: z.number().int().positive(),
        reason: z.string().max(20).optional(),
        pages: z.number().int().min(0).max(10000).optional(),
      }),
    )
    .max(500)
    .optional(),
});

export type HeartbeatStatus = z.infer<typeof heartbeatSchema>;

export const HEARTBEAT_RETENTION_DAYS = 30;
/** Visits and online time per day are kept two years, so a term can be compared with the year before */
export const USAGE_RETENTION_DAYS = 760;
/** A visit longer than this is a stuck tracker, not a visit */
const MAX_VISIT_SECONDS = 12 * 60 * 60;

export type ReportedVisit = NonNullable<HeartbeatStatus["visits"]>[number];

/** The reported visits that make sense: end after start, at most 12 hours, not in the future. */
export function plausibleVisits(visits: ReportedVisit[] | undefined, now: Date): ReportedVisit[] {
  const nowSeconds = Math.floor(now.getTime() / 1000) + 300; // device clocks may be a little ahead
  return (visits ?? []).filter(
    (v) => v.end >= v.start && v.end - v.start <= MAX_VISIT_SECONDS && v.end <= nowSeconds,
  );
}
