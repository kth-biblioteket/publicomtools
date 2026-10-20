import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Starts the film for browsers that don't autoplay from the attributes alone (older Chromium on
 * Samsung Tizen, some desktop browsers): mutes it in script and calls play(), again when it can
 * play and every other second while paused, at most five times (a TV shows its sound icon on each try).
 * A player that preloads the page in a hidden frame (PubLiPlayer) posts 'pp-activate' when it shows it:
 * the film then starts over, instead of being some seconds in. ES5, since Tizen 4.0 runs Chromium 56. Allowed by its
 * hash in the CSP, so no other script can run on the page.
 */
const PLAY_SCRIPT =
  "(function(){var v=document.querySelector('video');if(!v)return;v.muted=true;" +
  "function p(){var r=v.play();if(r&&r.catch)r.catch(function(){});}" +
  "p();v.addEventListener('canplay',p);var n=0,t=setInterval(function(){if(++n>5)return clearInterval(t);if(v.paused)p();},2000);" +
  "window.addEventListener('message',function(e){if(e.data==='pp-activate'){try{v.currentTime=0;}catch(x){}p();}});})();";
const PLAY_SCRIPT_HASH = `'sha256-${createHash("sha256").update(PLAY_SCRIPT).digest("base64")}'`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A file from the media library as a page a sign can show like any web page (a row in SIGN_PAGES or
 * a playlist): the image or film filling the screen, ?fit=contain to show all of it. A film plays
 * muted and loops (started by PLAY_SCRIPT, the only script allowed) (the kiosk moves on after the row's seconds, set to the film's length).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = isMediaId(id) ? await db.media.findUnique({ where: { id }, select: { kind: true, name: true } }) : null;
  const fit = new URL(request.url).searchParams.get("fit") === "contain" ? "contain" : "cover";
  // Filmer med .mp4 i adressen (samma fil): Tizens videospelare hämtade ingenting utan ändelse
  const src = row?.kind === "video" ? `../f/${id}.mp4` : `../f/${id}`;
  const body = !row
    ? ""
    : row.kind === "video"
      ? `<video src="${src}" autoplay muted loop playsinline preload="auto"></video><script>${PLAY_SCRIPT}</script>`
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
      "Content-Security-Policy": `default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; script-src ${PLAY_SCRIPT_HASH}; base-uri 'none'; form-action 'none'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const HEAD = GET;
