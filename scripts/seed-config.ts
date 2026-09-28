/**
 * One-time import of the existing publicom config into the database.
 *
 *   PUBLICOM_CONFIG_DIR=/path/to/publicom/config \
 *   DATABASE_URL=postgresql://... \
 *   npx tsx scripts/seed-config.ts
 *
 * Reads config/base.env -> ConfigLayer(base), config/profiles/*.env ->
 * ConfigLayer(profile, name), config/hosts/*.env -> Computer.profile + overrides,
 * and seeds the ConfigKey catalog. Idempotent (upserts). Config only, no secrets.
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

// The known config keys and their types, driving admin-UI validation.
const CATALOG: Array<[string, string, string?]> = [
  ["PUBLICOM_BRANCH", "string"],
  ["RESOURCE_ID", "string"],
  ["LOGINTYPE", "enum", "password,pin"],
  ["API_URL", "url"],
  ["RESERVATION_API_UPDATE_URL", "url"],
  ["RESERVATION_API_CREATE_URL", "url"],
  ["RESERVATION_API_URL", "url"],
  ["RESERVATION_API_CURRENT_RES_URL", "url"],
  ["BOOKING_SYSTEM_URL", "url"],
  ["BOOKING_TYPE", "enum", "dropin"],
  ["DEFAULT_BOOKING_TIME", "int"],
  ["REGISTER_ACCOUNT_URL", "url"],
  ["EXTERNAL_URL_TIMEOUT", "int"],
  ["CLEAR_FIELDS_TIMEOUT", "int"],
  ["ELECTRON_DEV_TOOLS", "bool"],
  ["ALMA_LOGIN", "bool"],
  ["PRINTER", "bool"],
  ["PRINT_JOB_SHEETS", "string"],
  ["FILE_DIALOGS", "bool"],
  ["COMPUTER_TYPE", "enum", "searchcomputer,signage,guestcomputer,grouproom"],
  ["SESSION_IDLE", "int"],
  ["SCREENSAVER", "bool"],
  ["SCREENSAVER_IDLE", "string"],
  ["SCREENSAVER_FILES", "csv"],
  ["POLICY_FILE", "string"],
  ["BLACK_LIST", "csv"],
  ["WHITE_LIST", "csv"],
  ["SSH_ALLOW_FROM", "string"],
  ["LOGIN_UI", "enum", "electron,web"],
  ["PUBLICOMTOOLS_URL", "url"],
  ["HEARTBEAT_URL", "url"],
  ["COMPUTER_NAME", "string"],
  ["SCREEN_ROTATION", "enum", "normal,left,right,inverted"],
  ["SIGNAGE", "bool"],
  ["WEBSITES", "csv"],
  ["BG_LANDSCAPE", "string"],
  ["BG_PORTRAIT", "string"],
];

async function main() {
  const dir = process.env.PUBLICOM_CONFIG_DIR;
  if (!dir) throw new Error("Set PUBLICOM_CONFIG_DIR to the publicom repo's config/ directory.");

  // Catalog
  for (const [key, type, enumValues] of CATALOG) {
    await db.configKey.upsert({
      where: { key },
      create: { key, type, enumValues: enumValues ?? null },
      update: { type, enumValues: enumValues ?? null },
    });
  }

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
    const values = parseEnv(readFileSync(join(dir, "profiles", f), "utf8"));
    await db.configLayer.upsert({
      where: { kind_name: { kind: "profile", name } },
      create: { kind: "profile", name, values },
      update: { values },
    });
    console.log(`profil ${name}: ${Object.keys(values).length} nycklar`);
  }

  // hosts -> Computer.profile + overrides
  for (const f of readdirSync(join(dir, "hosts")).filter((f) => f.endsWith(".env"))) {
    const host = basename(f, ".env");
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
