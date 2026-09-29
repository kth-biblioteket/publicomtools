import "server-only";
import { db } from "@/lib/db";
import { applyCatalog, diffCatalog, fetchCatalogSource, parseCatalog, type CatalogDiff } from "@/lib/catalog-core";

/** The Inställningskatalog page: preview and apply updates of the ConfigKey cache. */

export function getCatalogMeta() {
  return db.configCatalog.findUnique({ where: { id: 1 } });
}

export type CatalogPreview = { source: string; version: string; upToDate: boolean; diff: CatalogDiff };

/** What an update would change, without changing anything. */
export async function previewCatalogUpdate(): Promise<CatalogPreview> {
  const src = await fetchCatalogSource();
  const catalog = parseCatalog(src.text);
  const [stored, meta] = await Promise.all([db.configKey.findMany(), getCatalogMeta()]);
  const diff = diffCatalog(stored, catalog);
  const empty = !diff.added.length && !diff.changed.length && !diff.removed.length;
  return { source: src.source, version: src.version, upToDate: empty && meta?.version === src.version, diff };
}

/** Fetch and apply. `expectedVersion` guards against applying something other than what was previewed. */
export async function updateCatalog(fetchedBy: string, expectedVersion?: string) {
  const src = await fetchCatalogSource();
  if (expectedVersion && src.version !== expectedVersion)
    throw new Error("Katalogen har ändrats sedan du tittade. Hämta igen och granska ändringarna.");
  const catalog = parseCatalog(src.text);
  await applyCatalog(db, catalog, { source: src.source, version: src.version, fetchedBy });
  return { version: src.version, keys: catalog.keys.length };
}
