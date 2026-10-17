import { snapForSign } from "@/lib/snap";

export const dynamic = "force-dynamic";

/** Kiosks and players (Tizen) on other origins check the address with fetch before showing it */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "X-Rendered-At" };

/**
 * Sida som bild, as a page a sign shows like any other row (as /api/sign/m/<id>): the latest
 * image of the web page, filling the screen (?fit=contain: all of it). The first request waits
 * for the first image; later ones get the latest at once while an old one is renewed in the
 * background (src/lib/snap.ts). 503 while there has never been an image, so a player can skip it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await snapForSign(id);
  const fit = new URL(request.url).searchParams.get("fit") === "contain" ? "contain" : "cover";
  const status = !snap ? 404 : snap.renderedAt ? 200 : 503;
  const body = snap?.renderedAt ? `<img src="${id}/image?v=${snap.renderedAt.getTime()}" alt="">` : "";
  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sida som bild</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}img{display:block;width:100%;height:100%;object-fit:${fit}}</style>
</head>
<body>${body}</body>
</html>
`;
  return new Response(html, {
    status,
    headers: {
      ...CORS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      ...(snap?.renderedAt ? { "X-Rendered-At": snap.renderedAt.toISOString() } : {}),
    },
  });
}

export const HEAD = GET;
