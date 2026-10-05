import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/device-auth";

/**
 * Enrollment of Android tablets: the admin gets a one-time code for a device, the app sends it to
 * POST /api/device/enroll and gets its own device token back. Only hashes are stored. A new code
 * revokes the device's token, so a lost or replaced tablet can be cut off.
 */

export const ENROLL_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** No 0/O, 1/I/L: the code is typed on a tablet */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "K7QM-2XPA": 8 characters, 40 bits; valid for a day and only once. */
export function generateEnrollCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** "k7qm 2xpa" → "K7QM2XPA" */
export function normalizeEnrollCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A new code for the device, valid for a day. Revokes its current token. Returns the code (shown once). */
export async function newEnrollCode(host: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateEnrollCode();
  const expiresAt = new Date(Date.now() + ENROLL_CODE_TTL_MS);
  await db.computer.update({
    where: { host },
    data: { enrollCodeHash: sha256(normalizeEnrollCode(code)), enrollExpiresAt: expiresAt, tokenHash: null },
  });
  return { code, expiresAt };
}

/** Exchange a code for a device token. Null if the code is unknown, used or expired. */
export async function enrollDevice(code: string): Promise<{ host: string; token: string } | null> {
  const hash = sha256(normalizeEnrollCode(code));
  const device = await db.computer.findUnique({ where: { enrollCodeHash: hash }, select: { host: true, enrollExpiresAt: true } });
  if (!device || !device.enrollExpiresAt || device.enrollExpiresAt < new Date()) return null;
  const token = `pkd_${randomBytes(32).toString("base64url")}`;
  // Only if the code is still the same (two enrollments with one code: one wins)
  const { count } = await db.computer.updateMany({
    where: { host: device.host, enrollCodeHash: hash },
    data: { tokenHash: sha256(token), enrollCodeHash: null, enrollExpiresAt: null, enrolledAt: new Date() },
  });
  return count ? { host: device.host, token } : null;
}
