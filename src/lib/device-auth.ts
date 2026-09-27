import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The public computers authenticate with a shared token in
 * "Authorization: Bearer <token>" (PUBLICOM_DEVICE_TOKEN here, and in
 * /usr/local/bin/secrets/.secrets on each computer).
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
