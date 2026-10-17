import "server-only";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { headers } from "next/headers";
import sharp from "sharp";
import { withBasePath } from "@/lib/base-path";
import { db } from "@/lib/db";
import { asPlatform, PLATFORM_SHORT } from "@/lib/platforms";
import { listSnaps } from "@/lib/snap";

/**
 * The signs' media library. Files live in MEDIA_DIR (a bind mount on the server,
 * /local/docker/publicomtools/media, backed up with the server's files), named by the SHA-256 of
 * the stored content; the Media table holds what admin shows. Accepted: JPEG, PNG, WebP, PDF (split
 * into one image per page) and MP4, recognised by their content, never by name: no SVG or HTML,
 * which could carry scripts.
 */

export const MEDIA_DIR = process.env.MEDIA_DIR ?? "/data/media";
// Sökvägar under MEDIA_DIR är markerade turbopackIgnore: mappen är skyltarnas filer på servern, inte
// en del av appen, så Next ska inte försöka spåra (och ta med) dem när appen byggs.
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_PDF_PAGES = 50;
/** The whole library; MEDIA_QUOTA_GB on the server (/local has 25 GB free of 30, shared) */
export const QUOTA_BYTES = Number(process.env.MEDIA_QUOTA_GB || 8) * 1024 ** 3;
/** Images and pdf pages are scaled down to fit this box (the screens are at most 1920×1080) */
const MAX_SIDE = 1920;

const run = promisify(execFile);
export const isMediaId = (id: string) => /^[0-9a-f]{64}$/.test(id);
export const mediaPath = (id: string) => (isMediaId(id) ? join(/*turbopackIgnore: true*/ MEDIA_DIR, id) : null);

export type MediaItem = { id: string; name: string; kind: "image" | "video"; bytes: number; width: number | null; height: number | null; durationMs: number | null };
const toItem = (m: { id: string; name: string; kind: string; bytes: number; width: number | null; height: number | null; durationMs: number | null }): MediaItem => ({
  id: m.id,
  name: m.name,
  kind: m.kind === "video" ? "video" : "image",
  bytes: m.bytes,
  width: m.width,
  height: m.height,
  durationMs: m.durationMs,
});

type Sniffed = "jpeg" | "png" | "webp" | "pdf" | "mp4" | null;

/** The file type from its first bytes, never from the name or the browser's claim */
function sniff(head: Buffer): Sniffed {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (head.length >= 12 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (head.length >= 5 && head.toString("latin1", 0, 5) === "%PDF-") return "pdf";
  if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp") return "mp4";
  return null;
}

/**
 * A film's length from its 'mvhd' box (moov may be at the start or, without faststart, at the end).
 * Walks the top-level boxes with reads at offsets, so a large file is never read whole.
 */
async function mp4DurationMs(path: string): Promise<number | null> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const read = async (pos: number, len: number) => {
      const b = Buffer.alloc(len);
      const { bytesRead } = await fh.read(b, 0, len, pos);
      return b.subarray(0, bytesRead);
    };
    let pos = 0;
    while (pos + 8 <= size) {
      const h = await read(pos, 16);
      let boxSize = h.readUInt32BE(0);
      const type = h.toString("latin1", 4, 8);
      let header = 8;
      if (boxSize === 1) {
        boxSize = Number(h.readBigUInt64BE(8));
        header = 16;
      } else if (boxSize === 0) boxSize = size - pos;
      if (boxSize < header) return null;
      if (type === "moov") {
        const moov = await read(pos + header, Math.min(boxSize - header, 4 * 1024 * 1024));
        const at = moov.indexOf("mvhd", 0, "latin1");
        if (at < 4) return null;
        const v = moov[at + 4];
        const base = at + 8; // after version + flags
        const timescale = v === 1 ? moov.readUInt32BE(base + 16) : moov.readUInt32BE(base + 8);
        const duration = v === 1 ? Number(moov.readBigUInt64BE(base + 20)) : moov.readUInt32BE(base + 12);
        return timescale ? Math.round((duration / timescale) * 1000) : null;
      }
      pos += boxSize;
    }
    return null;
  } finally {
    await fh.close();
  }
}

export async function usedBytes(): Promise<number> {
  const r = await db.media.aggregate({ _sum: { bytes: true } });
  return r._sum.bytes ?? 0;
}

/** An image (or pdf page) re-encoded: upright, at most 1920 px, no metadata (GPS …), stored by hash */
async function saveImage(input: Buffer, format: "jpeg" | "png" | "webp", name: string, uploadedBy: string): Promise<MediaItem> {
  const img = sharp(input, { failOn: "error" }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
  const out = await (format === "webp" ? img.webp({ quality: 85 }) : img.jpeg({ quality: 85, mozjpeg: true })).toBuffer({ resolveWithObject: true });
  const id = createHash("sha256").update(out.data).digest("hex");
  const existing = await db.media.findUnique({ where: { id } });
  if (existing) return toItem(existing);
  await writeFile(join(/*turbopackIgnore: true*/ MEDIA_DIR, id), out.data);
  return toItem(
    await db.media.create({
      data: { id, name, mime: format === "webp" ? "image/webp" : "image/jpeg", kind: "image", bytes: out.data.length, width: out.info.width, height: out.info.height, uploadedBy },
    }),
  );
}

export type UploadResult = { ok: true; items: MediaItem[] } | { ok: false; error: string };

/**
 * Stores an upload: streamed to a temporary file (stopping at the size limit), checked by content,
 * then stored by hash (the same content twice is stored once). A pdf becomes one image per page.
 */
export async function saveUpload(body: ReadableStream<Uint8Array>, name: string, uploadedBy: string): Promise<UploadResult> {
  const tmpDir = join(/*turbopackIgnore: true*/ MEDIA_DIR, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmp = join(tmpDir, randomUUID());
  try {
    let bytes = 0;
    const counted = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
    counted.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_VIDEO_BYTES) counted.destroy(new Error("TOO_BIG"));
    });
    try {
      await pipeline(counted, createWriteStream(tmp));
    } catch (e) {
      if ((e as Error).message === "TOO_BIG") return { ok: false, error: "Filen är för stor (högst 200 MB för film och 30 MB för bild och pdf)." };
      throw e;
    }
    if ((await usedBytes()) + bytes > QUOTA_BYTES)
      return { ok: false, error: `Mediebiblioteket är fullt (${Math.round(QUOTA_BYTES / 1024 ** 3)} GB). Ta bort filer som inte används och försök igen.` };

    const fh = await open(tmp, "r");
    const head = Buffer.alloc(16);
    await fh.read(head, 0, 16, 0);
    await fh.close();
    const type = sniff(head);
    if (!type) return { ok: false, error: "Filtypen stöds inte. Ladda upp en bild (JPEG, PNG, WebP), en pdf eller en film (MP4, H.264)." };
    if (type !== "mp4" && bytes > MAX_FILE_BYTES) return { ok: false, error: "Filen är för stor (högst 30 MB för bild och pdf)." };

    const cleanName = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\p{L}\p{N} ._-]/gu, " ").trim().slice(0, 90) || "Utan namn";

    if (type === "jpeg" || type === "png" || type === "webp") {
      try {
        return { ok: true, items: [await saveImage(await readFile(tmp), type, cleanName, uploadedBy)] };
      } catch {
        return { ok: false, error: "Bilden går inte att läsa. Spara den på nytt som JPEG eller PNG och försök igen." };
      }
    }

    if (type === "pdf") {
      // En bild per sida med poppler (pdftoppm), i en egen tillfällig mapp; högst MAX_PDF_PAGES sidor
      const dir = await mkdtemp(join(tmpDir, "pdf-"));
      try {
        try {
          await run("pdftoppm", ["-jpeg", "-scale-to", String(MAX_SIDE), "-l", String(MAX_PDF_PAGES), tmp, join(dir, "p")], { timeout: 120_000 });
        } catch {
          return { ok: false, error: "Pdf:en går inte att läsa. Spara den på nytt (t.ex. Skriv ut › Spara som PDF) och försök igen." };
        }
        const pages = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort((a, b) => Number(a.match(/(\d+)\.jpg$/)?.[1]) - Number(b.match(/(\d+)\.jpg$/)?.[1]));
        if (!pages.length) return { ok: false, error: "Pdf:en har inga sidor." };
        const items: MediaItem[] = [];
        for (const [i, f] of pages.entries())
          items.push(await saveImage(await readFile(join(dir, f)), "jpeg", pages.length > 1 ? `${cleanName} – sida ${i + 1}` : cleanName, uploadedBy));
        return { ok: true, items };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }

    // Film: kodas inte om (det kräver ffmpeg och mycket processorkraft); längden läses ur filen
    const hash = createHash("sha256");
    await pipeline((await open(tmp, "r")).createReadStream(), hash);
    const id = hash.digest("hex");
    const existing = await db.media.findUnique({ where: { id } });
    if (existing) return { ok: true, items: [toItem(existing)] };
    const durationMs = await mp4DurationMs(tmp);
    await rename(tmp, join(/*turbopackIgnore: true*/ MEDIA_DIR, id));
    return { ok: true, items: [toItem(await db.media.create({ data: { id, name: cleanName, mime: "video/mp4", kind: "video", bytes, durationMs, uploadedBy } }))] };
  } finally {
    await rm(tmp, { force: true });
  }
}

/**
 * Where each file is used: the settings (profiles, base settings, single computers) whose values
 * mention its id (a 64-character hash, so a text match is exact).
 */
export async function mediaUsage(): Promise<Map<string, string[]>> {
  const [layers, computers] = await Promise.all([
    db.configLayer.findMany({ select: { kind: true, name: true, label: true, platform: true, values: true } }),
    db.computer.findMany({ select: { host: true, label: true, computerName: true, overrides: true } }),
  ]);
  const texts = [
    ...layers.map((l) => ({
      label: l.kind === "base" ? `Grundinställningar ${PLATFORM_SHORT[asPlatform(l.platform)]}` : `Profil ${l.label || l.name}`,
      text: JSON.stringify(l.values),
    })),
    ...computers.map((c) => ({ label: c.label || c.computerName || c.host, text: JSON.stringify(c.overrides) })),
  ];
  const out = new Map<string, string[]>();
  for (const t of texts) for (const m of t.text.matchAll(/[0-9a-f]{64}/g)) out.set(m[0], [...new Set([...(out.get(m[0]) ?? []), t.label])]);
  return out;
}

export async function listMedia(): Promise<(MediaItem & { createdAt: Date; uploadedBy: string; usedBy: string[] })[]> {
  const [rows, usage] = await Promise.all([db.media.findMany({ orderBy: { createdAt: "desc" } }), mediaUsage()]);
  return rows.map((m) => ({ ...toItem(m), createdAt: m.createdAt, uploadedBy: m.uploadedBy, usedBy: usage.get(m.id) ?? [] }));
}

export async function deleteMedia(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const used = (await mediaUsage()).get(id) ?? [];
  if (used.length) return { ok: false, error: `Filen används av ${used.join(", ")}. Ta bort den ur spellistorna där först.` };
  await db.media.deleteMany({ where: { id } });
  const path = mediaPath(id);
  if (path) await rm(path, { force: true });
  return { ok: true };
}

/** Whether the file is on disk (the row may be restored from a database dump without its file) */
export async function mediaOnDisk(id: string): Promise<boolean> {
  const path = mediaPath(id);
  if (!path) return false;
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * What the sign editor on a settings page needs: the library and the addresses, absolute so the
 * kiosks can load them (the request's public origin, as /api/device/config builds it). Nothing
 * when the platform's catalog has no signs.
 */
export async function signageProps(catalog: { key: string }[]) {
  if (!catalog.some((k) => k.key === "SIGN_PAGES")) return undefined;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const base = withBasePath("/api/sign");
  const [rows, snaps] = await Promise.all([db.media.findMany({ orderBy: { createdAt: "desc" } }), listSnaps()]);
  return {
    media: rows.map((m) => ({ id: m.id, name: m.name, kind: m.kind === "video" ? ("video" as const) : ("image" as const), durationMs: m.durationMs })),
    snaps,
    snapBase: `${origin}${base}/s/`,
    snapImageBase: `${base}/s/`,
    viewBase: `${origin}${base}/m/`,
    fileBase: `${base}/f/`,
    uploadUrl: withBasePath("/media/upload"),
  };
}
