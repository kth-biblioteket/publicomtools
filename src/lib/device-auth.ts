import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Devices authenticate with "Authorization: Bearer <token>":
 * - the Linux guest computers with a shared token (PUBLICOM_DEVICE_TOKEN here, and in
 *   /usr/local/bin/secrets/.secrets on each computer)
 * - Android tablets with their own token from enrollment (Computer.tokenHash), so a token taken
 *   from one public tablet only speaks for that tablet and can be revoked in the admin
 */

/** Constant-time comparison; hashing first makes the lengths equal. */
export function tokenMatches(given: string, expected: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Returns an error response to send back, or null if the request is from a computer. */
export function checkDeviceAuth(request: Request): Response | null {
  const expected = process.env.PUBLICOM_DEVICE_TOKEN;
  if (!expected) {
    return Response.json({ error: "device api disabled" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!given || !tokenMatches(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** SHA-256 (hex) of a device token or enrollment code: only the hash is stored. */
export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function bearer(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

/** shared = a Linux computer (it says which host it is); device = one enrolled Android tablet. */
export type DeviceIdentity = { kind: "shared" } | { kind: "device"; host: string };

/**
 * The shared token or a device's own token. Endpoints that take a host check it with
 * {@link mayActFor}, so a device token only speaks for its own device.
 */
export async function authenticateDevice(request: Request): Promise<{ identity: DeviceIdentity } | { denied: Response }> {
  const given = bearer(request);
  if (!given) return { denied: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const shared = process.env.PUBLICOM_DEVICE_TOKEN;
  if (shared && tokenMatches(given, shared)) return { identity: { kind: "shared" } };
  const device = await db.computer.findUnique({ where: { tokenHash: sha256(given) }, select: { host: true } });
  if (device) return { identity: { kind: "device", host: device.host } };
  return { denied: Response.json({ error: "unauthorized" }, { status: 401 }) };
}

/**
 * Whether the caller may read or report for this host: a device token only for its own device,
 * the shared token only for computers that are not Android (those have their own tokens).
 */
export async function mayActFor(identity: DeviceIdentity, host: string): Promise<boolean> {
  if (identity.kind === "device") return identity.host === host;
  const c = await db.computer.findUnique({ where: { host }, select: { platform: true } });
  return !c || c.platform !== "android";
}
