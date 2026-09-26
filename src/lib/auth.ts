import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

/**
 * Staff log in with KTH via librarytools-auth (see src/proxy.ts). This app
 * keeps no user table: the session is a signed cookie holding the identity
 * claims, and access is decided by ADMIN_EMAILS on every request.
 */

export const SESSION_COOKIE = "publicomtools_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionUser = { sub: string; email: string; name: string };

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

function devBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true";
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: process.env.BASE_PATH || "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (devBypassEnabled()) {
    return { sub: "dev", email: "dev@localhost", name: "Utvecklare" };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}

export function isAdmin(user: SessionUser) {
  if (devBypassEnabled()) return true;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/** For pages: logged-out visitors go to /login, non-admins to /forbidden. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/forbidden");
  return user;
}

export async function destroySession() {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
