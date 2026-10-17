import "server-only";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";

/**
 * Sida som bild: web pages the snap service (snap/server.js, headless Chromium in its own
 * container) renders to JPEGs, for signs whose browser can't draw KTH's live pages (Samsung Tizen
 * 4.0). A playlist row is the address /api/sign/s/<id>, shown like an uploaded image. An image is
 * rendered when a sign asks and it's older than the row's refreshMin, so only pages some sign shows
 * are rendered; the sign gets the previous image that time. A failure keeps the previous image.
 */

/** The snap service on its own network (docker-compose.yml) */
const SNAP_URL = process.env.SNAP_URL ?? "http://publicomtools-snap:3000";
// Under mediebibliotekets mapp (MEDIA_DIR i src/lib/media.ts), så att serverns filbackup tar med bilderna
const SNAP_DIR = join(process.env.MEDIA_DIR ?? "/data/media", "snap");
export const SNAP_REFRESH = [1, 2, 5, 10, 30, 60] as const;
export const SNAP_SIZES = { landscape: [1920, 1080], portrait: [1080, 1920] } as const;
/** Extra wait after the page's own requests are done, for its scripts to draw */
const WAIT_MS = 2000;

export const isSnapId = (id: string) => /^[a-z0-9]{20,32}$/.test(id);
const snapFile = (id: string) => join(SNAP_DIR, `${id}.jpg`);

export type SnapRow = NonNullable<Awaited<ReturnType<typeof db.snap.findUnique>>>;

/** The image file, or null if none has been rendered (or it's gone from disk) */
export async function snapImage(id: string): Promise<Buffer | null> {
  if (!isSnapId(id)) return null;
  try {
    return await readFile(snapFile(id));
  } catch {
    return null;
  }
}

// En rendering i taget per bild, även om flera skyltar frågar samtidigt
const inFlight = new Map<string, Promise<SnapRow | null>>();

/** Render now (or join a render already running) and keep the result; the row afterwards */
export function renderSnap(id: string): Promise<SnapRow | null> {
  const running = inFlight.get(id);
  if (running) return running;
  const job = (async () => {
    const snap = await db.snap.findUnique({ where: { id } });
    if (!snap) return null;
    try {
      const res = await fetch(`${SNAP_URL}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: snap.url, width: snap.width, height: snap.height, waitMs: WAIT_MS }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `renderingstjänsten svarade ${res.status}`);
      }
      const jpeg = Buffer.from(await res.arrayBuffer());
      await mkdir(SNAP_DIR, { recursive: true });
      const tmp = `${snapFile(id)}.${process.pid}.tmp`;
      await writeFile(tmp, jpeg);
      await rename(tmp, snapFile(id));
      return await db.snap.update({
        where: { id },
        data: { renderedAt: new Date(), renderMs: Number(res.headers.get("x-render-ms")) || null, bytes: jpeg.length, error: null, errorAt: null },
      });
    } catch (e) {
      const msg = e instanceof Error ? (e.name === "TimeoutError" ? "renderingstjänsten svarade inte i tid" : e.message) : String(e);
      const error = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(msg) ? "renderingstjänsten (publicomtools-snap) går inte att nå" : msg;
      console.error(`snap ${id} ${snap.url}: ${error}`);
      return await db.snap.update({ where: { id }, data: { error: error.slice(0, 300), errorAt: new Date() } });
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, job);
  return job;
}

const stale = (s: SnapRow) => !s.renderedAt || Date.now() - s.renderedAt.getTime() > s.refreshMin * 60_000;

/**
 * What a sign gets when it asks for the page: the row, rendered first if there is no image yet
 * (waiting for it), otherwise as it is, with a new image started in the background if it's old.
 */
export async function snapForSign(id: string): Promise<SnapRow | null> {
  if (!isSnapId(id)) return null;
  let snap = await db.snap.findUnique({ where: { id } });
  if (!snap) return null;
  // Senaste frågan, högst en skrivning per minut
  if (!snap.requestedAt || Date.now() - snap.requestedAt.getTime() > 60_000)
    await db.snap.update({ where: { id }, data: { requestedAt: new Date() } }).catch(() => {});
  if (!snap.renderedAt || !(await snapImage(id))) snap = (await renderSnap(id)) ?? snap;
  else if (stale(snap)) void renderSnap(id);
  return snap;
}

/** The row for an address and size, created if new (the refresh interval is the latest chosen) */
export async function ensureSnap(input: { url: string; width: number; height: number; refreshMin: number; user: string }): Promise<SnapRow> {
  return db.snap.upsert({
    where: { url_width_height: { url: input.url, width: input.width, height: input.height } },
    create: { url: input.url, width: input.width, height: input.height, refreshMin: input.refreshMin, createdBy: input.user },
    update: { refreshMin: input.refreshMin },
  });
}

export async function deleteSnapFile(id: string) {
  if (isSnapId(id)) await rm(snapFile(id), { force: true });
}

/** What the sign editor shows per row: address, size, interval and how the latest image went */
export type SnapInfo = {
  id: string;
  url: string;
  width: number;
  height: number;
  refreshMin: number;
  renderedAt: string | null;
  error: string | null;
  errorAt: string | null;
};
export const toSnapInfo = (s: SnapRow): SnapInfo => ({
  id: s.id,
  url: s.url,
  width: s.width,
  height: s.height,
  refreshMin: s.refreshMin,
  renderedAt: s.renderedAt?.toISOString() ?? null,
  error: s.error,
  errorAt: s.errorAt?.toISOString() ?? null,
});

export async function listSnaps(): Promise<SnapInfo[]> {
  return (await db.snap.findMany({ orderBy: { createdAt: "desc" } })).map(toSnapInfo);
}
