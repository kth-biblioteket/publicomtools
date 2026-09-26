import "server-only";
import { db } from "@/lib/db";
import { heartbeatSchema, type HeartbeatStatus } from "@/lib/heartbeat";
import { evaluate, type Evaluation } from "@/lib/status";

export type ComputerView = {
  host: string;
  hostname: string;
  profile: string | null;
  computerName: string | null;
  lastSeenAt: Date;
  lastIp: string | null;
  status: HeartbeatStatus | null;
  evaluation: Evaluation;
  secondsSinceSeen: number;
};

const SEVERITY = { offline: 0, warning: 1, ok: 2 } as const;

/** Stored payloads are re-validated on read, so a malformed row shows up as
 * a warning instead of breaking the page. */
export function toView(computer: {
  host: string;
  hostname: string;
  profile: string | null;
  computerName: string | null;
  lastSeenAt: Date;
  lastIp: string | null;
  status: unknown;
}, now = new Date()): ComputerView {
  const parsed = heartbeatSchema.safeParse(computer.status);
  const status = parsed.success ? parsed.data : null;
  const evaluation = status
    ? evaluate(computer.lastSeenAt, status, now)
    : { health: "warning" as const, problems: ["Senaste status kunde inte läsas"] };
  const secondsSinceSeen = (now.getTime() - computer.lastSeenAt.getTime()) / 1000;
  return { ...computer, status, evaluation, secondsSinceSeen };
}

export async function listComputers(): Promise<ComputerView[]> {
  const rows = await db.computer.findMany({ orderBy: { host: "asc" } });
  return rows
    .map((row) => toView(row))
    .sort((a, b) => SEVERITY[a.evaluation.health] - SEVERITY[b.evaluation.health] || a.host.localeCompare(b.host));
}
