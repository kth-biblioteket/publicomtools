import "server-only";
import { z } from "zod";

/**
 * What publicom's /usr/local/bin/heartbeat.sh sends every 5 minutes.
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
  guestService: z.string().max(40),
  sessionStartedAt: z.string().max(40).optional(),
  guestRestarts: z.number().int().optional(),
  failedUnits: z.array(z.string().max(200)).max(50).default([]),
  rebootRequired: z.boolean().default(false),
  diskFreePercent: z.number().int().min(0).max(100).optional(),
  /** PUBLICOM_CONFIG_VERSION of the settings the running session started with */
  configVersion: z.string().max(64).optional(),
});

export type HeartbeatStatus = z.infer<typeof heartbeatSchema>;

export const HEARTBEAT_RETENTION_DAYS = 30;
