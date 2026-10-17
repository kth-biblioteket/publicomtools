import { db } from "@/lib/db";
import { isMediaId } from "@/lib/media";

export const dynamic = "force-dynamic";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A file from the media library as a page a sign can show like any web page (a row in SIGN_PAGES or
 * a playlist): the image or film filling the screen, ?fit=contain to show all of it. No scripts; a
 * film plays muted and loops (the kiosk moves on after the row's seconds, set to the film's length).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = isMediaId(id) ? await db.media.findUnique({ where: { id }, select: { kind: true, name: true } }) : null;
  const fit = new URL(request.url).searchParams.get("fit") === "contain" ? "contain" : "cover";
  const src = `../f/${id}`;
  const body = !row
    ? ""
    : row.kind === "video"
      ? `<video src="${src}" autoplay muted loop playsinline></video>`
      : `<img src="${src}" alt="">`;
  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(row?.name ?? "Saknas")}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}img,video{display:block;width:100%;height:100%;object-fit:${fit}}</style>
</head>
<body>${body}</body>
</html>
`;
  return new Response(html, {
    status: row ? 200 : 404,
    headers: {
      // Spelare på annan origin (Tizen) kontrollerar sidan med fetch före visning
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const HEAD = GET;
