import "server-only";
import { cookies } from "next/headers";

/** The login screen's ticket, set by /guest/start and read by the /guest pages. */
export const GUEST_COOKIE = "publicom_guest";

export function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `${process.env.BASE_PATH ?? ""}/guest`,
  };
}

export async function getGuestTicket() {
  return (await cookies()).get(GUEST_COOKIE)?.value ?? "";
}
