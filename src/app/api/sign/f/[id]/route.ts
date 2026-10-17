import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { mediaPath } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * A file in the signs' media library, public like the pages the signs show. The name is the hash of the content, so
 * it never changes: cached for a year. Range requests (206) so a film can start before it's all
 * loaded. A file missing on disk (a restored database without the file) is 404; the sign shows a black page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = mediaPath(id);
  const row = path ? await db.media.findUnique({ where: { id }, select: { mime: true } }) : null;
  let size = 0;
  try {
    if (!path || !row) throw new Error("unknown");
    size = (await stat(path)).size;
  } catch {
    return new Response("Hittar inte filen.", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  const headers: Record<string, string> = {
    // Spelare på annan origin (Tizen) kontrollerar filen med fetch före visning
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Content-Type": row.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Accept-Ranges": "bytes",
  };

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
