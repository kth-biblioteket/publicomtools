import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { mediaPath } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * A file in the signs' media library, public like the pages the signs show. The name is the hash of the content, so
 * it never changes: cached for a year, with the hash as ETag. Range requests (206) so a film can start before it's
 * all loaded. A file missing on disk (a restored database without the file) is 404; the sign shows a black page.
 * The headers are what ordinary file servers send (ETag, Last-Modified, no CSP: only JPEG, PNG, WebP and MP4
 * are stored, src/lib/media.ts). Samsung Tizen's video player played nothing from here until the server
 * answered on IPv6 too (ufw, 20 okt); the header changes made on the way are harmless and kept.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // <id>.mp4, .jpg, .png, .webp är samma fil (filmsidan använder .mp4)
  const id = (await params).id.replace(/\.(mp4|jpe?g|png|webp)$/i, "");
  const path = mediaPath(id);
  const row = path ? await db.media.findUnique({ where: { id }, select: { mime: true } }) : null;
  let size = 0;
  let modified = new Date(0);
  try {
    if (!path || !row) throw new Error("unknown");
    const st = await stat(path);
    size = st.size;
    modified = st.mtime;
  } catch {
    return new Response("Hittar inte filen.", { status: 404 });
  }
  const headers: Record<string, string> = {
    // Ingen CORS här: spelarna kontrollerar filmsidan (/api/sign/m/), inte filen, och Tizens videospelare
    // hämtade ingenting när filen hade Access-Control-Allow-Origin (prov 19 okt)
    "Content-Type": row.mime,
    "Cache-Control": "public, max-age=31536000",
    ETag: `"${id}"`,
    "Last-Modified": modified.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (request.headers.get("if-none-match") === `"${id}"`) return new Response(null, { status: 304, headers });

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}

export const HEAD = GET;
