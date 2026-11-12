import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { atLeast, isRole, type Role } from "@/lib/roles";
import { groupMatches, roleGroups, type GroupsVar } from "@/lib/role-groups";

/**
 * Staff log in with KTH via librarytools-auth (see src/proxy.ts). This app
 * keeps no user table: the session is a signed cookie holding the identity
 * claims, and the role (roles.ts) is decided by the e-mail lists on every request.
 */

export const SESSION_COOKIE = "publicomtools_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

/** groups: the person's KTH groups that some role names (role-groups.ts), from the login */
export type SessionUser = { sub: string; email: string; name: string; groups?: string[] };

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

function devBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true";
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ email: user.email, name: user.name, groups: user.groups ?? [] })
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
      groups: Array.isArray(payload.groups) ? payload.groups.map(String) : [],
    };
  } catch {
    return null;
  }
}

function emailList(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The user's role (see roles.ts), or null for no access. From the lists IT_EMAILS (and the older
 * ADMIN_EMAILS, which gives IT), EDITOR_EMAILS and CONTENT_EMAILS, and the KTH groups in
 * IT_GROUPS, EDITOR_GROUPS and CONTENT_GROUPS (from the login); the highest one counts.
 * DEV_ROLE picks the role with the development login bypass.
 */
export function roleOf(user: SessionUser): Role | null {
  if (devBypassEnabled()) return isRole(process.env.DEV_ROLE) ? process.env.DEV_ROLE : "it";
  const email = user.email.toLowerCase();
  const groups = user.groups ?? [];
  const has = (emails: string, groupsVar: GroupsVar) =>
    emailList(emails).includes(email) || roleGroups(groupsVar).some((g) => groupMatches(g, groups));
  if (has("IT_EMAILS", "IT_GROUPS") || emailList("ADMIN_EMAILS").includes(email)) return "it";
  if (has("EDITOR_EMAILS", "EDITOR_GROUPS")) return "redaktor";
  if (has("CONTENT_EMAILS", "CONTENT_GROUPS")) return "innehall";
  return null;
}

/**
 * For pages and server actions: logged-out visitors go to /login, those without the role to
 * /forbidden. Returns the user with their role.
 */
export async function requireRole(min: Role = "innehall"): Promise<SessionUser & { role: Role }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = roleOf(user);
  if (!atLeast(role, min)) redirect("/forbidden");
  return { ...user, role: role! };
}

/** Any access at all (a role); for routes that answer 403 instead of redirecting. */
export function isAdmin(user: SessionUser) {
  return roleOf(user) !== null;
}

/** Any access at all (the role Innehåll or higher). */
export async function requireAdmin() {
  return requireRole("innehall");
}

export async function destroySession() {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
