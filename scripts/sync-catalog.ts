/**
 * Load the config key catalog (publicom's config/catalog.json) into ConfigKey.
 * The admin UI does the same from Inställningskatalog; this is for first setup and dev.
 *
 *   PUBLICOM_CATALOG_FILE=/path/to/publicom/config/catalog.json \
 *   DATABASE_URL=postgresql://... \
 *   npx tsx scripts/sync-catalog.ts
 *
 * Without PUBLICOM_CATALOG_FILE it reads the file from GitHub
 * (PUBLICOM_CATALOG_REPO, default kth-biblioteket/publicom; PUBLICOM_CATALOG_REF, default stable).
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { applyCatalog, diffCatalog, fetchCatalogSource, parseCatalog } from "../src/lib/catalog-core";

const db = new PrismaClient();

async function main() {
  const src = await fetchCatalogSource();
  const catalog = parseCatalog(src.text);
  const diff = diffCatalog(await db.configKey.findMany(), catalog);
  for (const k of diff.added) console.log(`+ ${k.key}`);
  for (const c of diff.changed) console.log(`~ ${c.key.key} (${c.fields.join(", ")})`);
  for (const k of diff.removed) console.log(`- ${k.key}`);
  await applyCatalog(db, catalog, { source: src.source, version: src.version, fetchedBy: "scripts/sync-catalog.ts" });
  console.log(`${catalog.keys.length} nycklar från ${src.source} (${src.version})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
