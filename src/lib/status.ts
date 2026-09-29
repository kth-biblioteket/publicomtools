import type { HeartbeatStatus } from "@/lib/heartbeat";

/** Computers send a heartbeat every 5 minutes (plus up to 30 s random delay). */
export const OFFLINE_AFTER_MS = 15 * 60 * 1000;
const LOW_DISK_PERCENT = 10;

export type Health = "ok" | "warning" | "offline";

/** A problem in plain Swedish, what to do about it, and the technical detail for IT. */
export type Problem = { text: string; hint: string; detail?: string };

export type Evaluation = { health: Health; problems: Problem[] };

/** Decides the colour shown on the status page, with the reasons in Swedish. */
export function evaluate(lastSeenAt: Date, status: HeartbeatStatus, now = new Date()): Evaluation {
  const sinceMs = now.getTime() - lastSeenAt.getTime();
  if (sinceMs > OFFLINE_AFTER_MS) {
    return {
      health: "offline",
      problems: [
        {
          text: `Ingen kontakt sedan ${formatWhen(lastSeenAt, now)}`,
          hint: "Kontrollera att datorn är påslagen och att nätverkskabeln sitter i.",
          detail: `senaste heartbeat ${formatTime(lastSeenAt)}`,
        },
      ],
    };
  }

  const problems: Problem[] = [];
  if (status.guestService !== "active") {
    problems.push({
      text: "Gästprogrammet är inte igång",
      hint: "Vänta några minuter. Starta om datorn om det inte löser sig.",
      detail: `guest.service: ${status.guestService}`,
    });
  }
  if (status.failedUnits.length > 0) {
    problems.push({
      text: status.failedUnits.length === 1 ? "En tjänst på datorn har kraschat" : `${status.failedUnits.length} tjänster på datorn har kraschat`,
      hint: "Starta om datorn. Kontakta IT om det kommer tillbaka.",
      detail: status.failedUnits.join(", "),
    });
  }
  if (status.diskFreePercent !== undefined && status.diskFreePercent < LOW_DISK_PERCENT) {
    problems.push({
      text: `Disken är nästan full (${100 - status.diskFreePercent} %)`,
      hint: "Loggar rensas vid omstart. Kontakta IT om det kommer tillbaka.",
      detail: `${status.diskFreePercent} % ledigt`,
    });
  }
  if (status.rebootRequired) {
    problems.push({
      text: "Behöver startas om efter en systemuppdatering",
      hint: "Starta om datorn när ingen använder den.",
      detail: "reboot-required",
    });
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

/** "nyss", "för 12 min sedan", "för 3 tim sedan", "för 2 dagar sedan" */
export function formatAgo(date: Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "nyss";
  if (s < 3600) return `för ${Math.floor(s / 60)} min sedan`;
  if (s < 86400) return `för ${Math.floor(s / 3600)} tim sedan`;
  const d = Math.floor(s / 86400);
  return `för ${d} ${d === 1 ? "dag" : "dagar"} sedan`;
}

const TZ = "Europe/Stockholm";
const WEEKDAYS = ["söndags", "måndags", "tisdags", "onsdags", "torsdags", "fredags", "lördags"];

/** "kl 11.32", "igår kl 11.32", "i fredags kl 11.32", "12 sep kl 11.32" */
export function formatWhen(date: Date, now = new Date()): string {
  const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
  const time = date.toLocaleTimeString("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(":", ".");
  const daysAgo = Math.round((new Date(day(now)).getTime() - new Date(day(date)).getTime()) / 86400000);
  if (daysAgo === 0) return `kl ${time}`;
  if (daysAgo === 1) return `igår kl ${time}`;
  if (daysAgo < 7) {
    const wd = new Date(date.toLocaleString("en-US", { timeZone: TZ })).getDay();
    return `i ${WEEKDAYS[wd]} kl ${time}`;
  }
  return `${date.toLocaleDateString("sv-SE", { timeZone: TZ, day: "numeric", month: "short" })} kl ${time}`;
}
