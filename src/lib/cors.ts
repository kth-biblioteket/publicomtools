/**
 * CORS for the device API (enroll, config, heartbeat): the Tizen player (PubLiPlayer) is a web app
 * on another origin and calls these with fetch. Allowed from any origin: the devices authenticate
 * with a bearer token (or the one-time code), never with cookies, so a page elsewhere gains nothing
 * a script outside a browser couldn't already do. Android and Linux don't use CORS and see no change.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
};

/** The preflight a browser sends before a POST with JSON or an Authorization header */
export const corsPreflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** The handler with the CORS headers on every answer, errors included (also an unexpected one) */
export function withCors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    let res: Response;
    try {
      res = await handler(...args);
    } catch (e) {
      console.error(e);
      res = Response.json({ error: "internal error" }, { status: 500 });
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
