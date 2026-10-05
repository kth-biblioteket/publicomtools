import "server-only";
import { db } from "@/lib/db";
import { applyCatalog, contentHash, diffCatalog, fetchCatalogSource, parseCatalog, type CatalogDiff, type CatalogSource } from "@/lib/catalog-core";
import type { Platform } from "@/lib/platforms";

/** The Inställningskatalog page: preview and apply updates of a platform's ConfigKey cache. */

export function getCatalogMeta(platform: Platform) {
  return db.configCatalog.findUnique({ where: { platform } });
}

export type CatalogPreview = { source: string; version: string; upToDate: boolean; diff: CatalogDiff };

/** An uploaded catalog.json (from a local publicom checkout), so the catalog can be loaded without pushing publicom. */
export function uploadedSource(fileName: string, text: string): CatalogSource {
  return { text, source: `uppladdad fil: ${fileName.slice(0, 100)}`, version: contentHash(text) };
}

/** What an update would change, without changing anything. Fetches from GitHub unless `src` is given. */
export async function previewCatalogUpdate(platform: Platform, src?: CatalogSource): Promise<CatalogPreview> {
  src ??= await fetchCatalogSource(platform);
  const catalog = parseCatalog(src.text);
  const [stored, meta] = await Promise.all([db.configKey.findMany({ where: { platform } }), getCatalogMeta(platform)]);
  const diff = diffCatalog(stored, catalog);
  const empty = !diff.added.length && !diff.changed.length && !diff.removed.length;
  return { source: src.source, version: src.version, upToDate: empty && meta?.version === src.version, diff };
}

/** Fetch and apply. `expectedVersion` guards against applying something other than what was previewed. */
export async function updateCatalog(platform: Platform, fetchedBy: string, expectedVersion?: string, src?: CatalogSource) {
  src ??= await fetchCatalogSource(platform);
  if (expectedVersion && src.version !== expectedVersion)
    throw new Error("Katalogen har ändrats sedan du tittade. Hämta igen och granska ändringarna.");
  const catalog = parseCatalog(src.text);
  await applyCatalog(db, platform, catalog, { source: src.source, version: src.version, fetchedBy });
  return { version: src.version, keys: catalog.keys.length };
}
