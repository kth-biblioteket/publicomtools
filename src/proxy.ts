import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

/**
 * Turns the short-lived identity token librarytools-auth sets after a KTH
 * login (the kth_identity cookie) into this app's own session cookie —
 * same contract as bookingtools' proxy.ts, see librarytools-auth's README.
 */

const IDENTITY_COOKIE = "kth_identity";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const jwksUrl = process.env.KTH_AUTH_JWKS_URL;
    if (!jwksUrl) {
      throw new Error("KTH_AUTH_JWKS_URL is not set — cannot verify KTH identity tokens.");
    }
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

function publicHost(request: NextRequest) {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
}

/** The URL the browser asked for — behind Traefik, request.nextUrl can carry
 * the container's own http origin instead of the public https one. */
function publicUrl(request: NextRequest) {
  const url = request.nextUrl.clone();
  const [hostname, port = ""] = publicHost(request).split(":");
  url.hostname = hostname;
  url.port = port;
  url.protocol = request.headers.get("x-forwarded-proto") ?? url.protocol;
  return url;
}

/** The identity cookie is set with Domain=<shared host>; a browser only drops
 * it when the deletion carries the same Domain. */
function deleteIdentityCookie(request: NextRequest, response: NextResponse) {
  const host = publicHost(request).split(":")[0];
  response.cookies.set(IDENTITY_COOKIE, "", { path: "/", maxAge: 0, ...(host && { domain: host }) });
}

type IdentityClaims = { sub: string; email: string; name: string };

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(IDENTITY_COOKIE)?.value;
  if (!token) return NextResponse.next();

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ["EdDSA"],
      issuer: publicUrl(request).origin,
    });
    const claims = payload as unknown as IdentityClaims;
    const session = await createSessionToken({ sub: claims.sub, email: claims.email, name: claims.name });

    // Redirect to the same URL so the page renders with the new cookie.
    const response = NextResponse.redirect(publicUrl(request));
    response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
    deleteIdentityCookie(request, response);
    return response;
  } catch (error) {
    console.error("KTH identity token verification failed:", error);
    const response = NextResponse.next();
    deleteIdentityCookie(request, response);
    return response;
  }
}

export const config = {
  matcher: [
    // Under a basePath the app root itself (/publicomtools) isn't matched by
    // the catch-all below.
    { source: "/", has: [{ type: "cookie", key: "kth_identity" }] },
    {
      source: "/((?!_next/static|_next/image|favicon.ico|api/).*)",
      has: [{ type: "cookie", key: "kth_identity" }],
    },
  ],
};
