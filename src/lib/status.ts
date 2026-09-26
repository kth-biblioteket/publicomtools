import type { HeartbeatStatus } from "@/lib/heartbeat";

/** Computers send a heartbeat every 5 minutes (plus up to 30 s random delay). */
export const OFFLINE_AFTER_MS = 15 * 60 * 1000;
const LOW_DISK_PERCENT = 10;

export type Health = "ok" | "warning" | "offline";

export type Evaluation = { health: Health; problems: string[] };

/** Decides the colour shown on the status page, with the reasons in Swedish. */
export function evaluate(lastSeenAt: Date, status: HeartbeatStatus, now = new Date()): Evaluation {
  const sinceMs = now.getTime() - lastSeenAt.getTime();
  if (sinceMs > OFFLINE_AFTER_MS) {
    return { health: "offline", problems: [`Ingen kontakt på ${formatDuration(sinceMs / 1000)}`] };
  }

  const problems: string[] = [];
  if (status.guestService !== "active") {
    problems.push(`Sessionen (guest.service) är ${status.guestService}`);
  }
  if (status.failedUnits.length > 0) {
    problems.push(`Kraschade tjänster: ${status.failedUnits.join(", ")}`);
  }
  if (status.diskFreePercent !== undefined && status.diskFreePercent < LOW_DISK_PERCENT) {
    problems.push(`Bara ${status.diskFreePercent} % ledigt diskutrymme`);
  }
  if (status.rebootRequired) {
    problems.push("Väntar på omstart efter uppdatering");
  }
  return { health: problems.length > 0 ? "warning" : "ok", problems };
}

/** "3 d 4 h", "2 h 5 min", "12 min", "40 s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min`;
  return `${s} s`;
}

export function formatTime(value: Date | string | undefined): string {
  if (!value) return "–";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" });
}
