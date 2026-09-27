import { NextResponse } from "next/server";
import { findLogin } from "@/lib/guest-login";
import { GUEST_COOKIE, guestCookieOptions } from "@/lib/guest-cookie";
import { withBasePath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

/** Chromium on the guest computer opens this with the ticket; it moves into
 * an HttpOnly cookie so it doesn't stay in the page URL. */
export async function GET(request: Request) {
  const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
  const screen = await findLogin(ticket);

  // Behind Traefik request.url can carry the container's own origin; build
  // the redirect from the host the browser actually used.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const response = NextResponse.redirect(`${proto}://${host}${withBasePath("/guest")}`);
  if (screen && screen.status === "pending") {
    response.cookies.set(GUEST_COOKIE, ticket, guestCookieOptions());
  }
  return response;
}
