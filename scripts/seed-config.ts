/**
 * One-time import of the existing publicom config into the database.
 *
 *   PUBLICOM_CONFIG_DIR=/path/to/publicom/config \
 *   DATABASE_URL=postgresql://... \
 *   npx tsx scripts/seed-config.ts
 *
 * Reads config/base.env -> ConfigLayer(base), config/profiles/*.env ->
 * ConfigLayer(profile, name), config/hosts/*.env -> Computer.profile + overrides.
 * Idempotent (upserts). Config only, no secrets. The key catalog is loaded
 * separately by scripts/sync-catalog.ts (from config/catalog.json).
 * See docs/config-via-publicomtools.md in the publicom repo.
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient();

/** Parse KEY=value the same way the computers' load_config does (no execution). */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let line of text.split("\n")) {
    line = line.replace(/\r$/, "");
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("="));
    let val = line.slice(line.indexOf("=") + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

async function main() {
  const dir = process.env.PUBLICOM_CONFIG_DIR;
  if (!dir) throw new Error("Set PUBLICOM_CONFIG_DIR to the publicom repo's config/ directory.");

  // base
  const base = parseEnv(readFileSync(join(dir, "base.env"), "utf8"));
  await db.configLayer.upsert({
    where: { kind_name: { kind: "base", name: "" } },
    create: { kind: "base", name: "", values: base },
    update: { values: base },
  });
  console.log(`base: ${Object.keys(base).length} nycklar`);

  // profiles
  for (const f of readdirSync(join(dir, "profiles")).filter((f) => f.endsWith(".env"))) {
    const name = basename(f, ".env");
    const text = readFileSync(join(dir, "profiles", f), "utf8");
    const values = parseEnv(text);
    // The file's first comment line describes the profile, e.g. "# Sökdator (Primo och Libris)".
    const description = text.match(/^#\s*(.+)$/m)?.[1]?.trim() ?? null;
    await db.configLayer.upsert({
      where: { kind_name: { kind: "profile", name } },
      create: { kind: "profile", name, values, description },
      update: { values },
    });
    console.log(`profil ${name}: ${Object.keys(values).length} nycklar`);
  }

  // hosts -> Computer.profile + overrides. test-* är VM-/hårdvarutestkonfigar (t.ex.
  // test-ref med 10.0.2.2 mot UTM-värden), inte riktiga flottdatorer — hoppa över dem.
  for (const f of readdirSync(join(dir, "hosts")).filter((f) => f.endsWith(".env"))) {
    const host = basename(f, ".env");
    if (host.startsWith("test-")) {
      console.log(`host ${host}: hoppas över (testkonfig)`);
      continue;
    }
    const all = parseEnv(readFileSync(join(dir, "hosts", f), "utf8"));
    const profile = all.PROFILE ?? null;
    const overrides = { ...all };
    delete overrides.PROFILE;
    await db.computer.upsert({
      where: { host },
      create: {
        host,
        hostname: host,
        lastSeenAt: new Date(0),
        status: {},
        profile,
        overrides,
      },
      update: { profile, overrides },
    });
    console.log(`host ${host}: profil=${profile ?? "-"}, ${Object.keys(overrides).length} overrides`);
  }
}

main()
  .then(() => console.log("Klart."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
