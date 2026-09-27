import "server-only";

/**
 * Library-account login via almatools' /almalogin, which checks the
 * credentials against Alma. Same contract as the old Electron login app
 * (publicom files/usr/local/bin/electron-login/main.js, verifyCode).
 */

const TIMEOUT_MS = 10_000;

export type AlmaResult =
  | { ok: true; primaryId: string; token: string | null }
  | { ok: false; reason: "invalid-username" | "invalid" | "inactive" | "not-non-kth" | "error" };

export async function verifyAlmaUser(user: string, code: string, loginType: string): Promise<AlmaResult> {
  const base = process.env.ALMA_LOGIN_URL;
  if (!base) throw new Error("ALMA_LOGIN_URL is not set.");
  const pin = loginType === "pin";
  const url = pin ? base : `${base}?op=auth`;
  const body = pin ? { user, pin_number: code } : { user, password: code };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // Never log the request itself: it contains the password
    console.error("almalogin unreachable:", (error as Error).message);
    return { ok: false, reason: "error" };
  }

  if (response.status === 400) return { ok: false, reason: "invalid-username" };
  if (response.status === 401) return { ok: false, reason: "invalid" };
  if (response.status === 402) return { ok: false, reason: "inactive" };
  if (response.status === 403) return { ok: false, reason: "not-non-kth" };
  if (!response.ok) {
    console.error("almalogin answered", response.status);
    return { ok: false, reason: "error" };
  }

  const data = (await response.json().catch(() => null)) as
    | { message?: string; token?: string; data?: { primary_id?: string } }
    | null;
  if (data?.message !== "Success" || !data.data?.primary_id) return { ok: false, reason: "invalid" };
  return { ok: true, primaryId: data.data.primary_id, token: data.token ?? null };
}
