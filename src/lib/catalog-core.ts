import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";

/**
 * The config key catalog: which settings the guest computers understand, with the
 * labels, help texts, types and defaults the admin UI shows. The source of truth is
 * config/catalog.json in the publicom repo, written in the same commit as the code
 * that reads a key; ConfigKey is a cache of it. No server-only import here, so
 * scripts/sync-catalog.ts can use it as well as the app.
 */

const keyName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "nyckeln ska vara VERSALER_MED_UNDERSTRECK");

export const catalogSchema = z
  .object({
    version: z.literal(1),
    groups: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1) })).min(1),
    keys: z.array(
      z.object({
        key: keyName,
        label: z.string().min(1),
        group: z.string(),
        type: z.enum(["int", "bool", "string", "csv", "url", "enum"]),
        options: z.array(z.object({ value: z.string(), label: z.string().min(1) })).optional(),
        unit: z.string().optional(),
        /** csv only: " " for space-separated lists (WEBSITES); default "," */
        separator: z.enum([",", " "]).optional(),
        default: z.string().optional(),
        help: z.string().optional(),
        example: z.string().optional(),
        advanced: z.boolean().optional(),
      })
    ),
  })
  .superRefine((cat, ctx) => {
    const groups = new Set(cat.groups.map((g) => g.id));
    const seen = new Set<string>();
    cat.keys.forEach((k, i) => {
      if (seen.has(k.key)) ctx.addIssue({ code: "custom", path: ["keys", i, "key"], message: `${k.key} finns två gånger` });
      seen.add(k.key);
      if (!groups.has(k.group))
        ctx.addIssue({ code: "custom", path: ["keys", i, "group"], message: `${k.key}: okänd grupp ${k.group}` });
      if (k.type === "enum" && !k.options?.length)
        ctx.addIssue({ code: "custom", path: ["keys", i, "options"], message: `${k.key}: enum utan options` });
    });
  });

export type CatalogFile = z.infer<typeof catalogSchema>;
export type CatalogKey = CatalogFile["keys"][number];

/** Parse catalog.json text; throws with a readable message listing every problem. */
export function parseCatalog(text: string): CatalogFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`catalog.json är inte giltig JSON: ${(e as Error).message}`);
  }
  const parsed = catalogSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`catalog.json stämmer inte:\n${parsed.error.issues.map((i) => `- ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** A ConfigKey row as stored, in the shape of a catalog key, for diffing. */
type StoredKey = {
  key: string;
  label: string;
  group: string;
  type: string;
  options: unknown;
  unit: string | null;
  separator: string;
  defaultValue: string | null;
  help: string | null;
  example: string | null;
  advanced: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  label: "namn",
  group: "grupp",
  type: "typ",
  options: "val",
  unit: "enhet",
  separator: "avgränsare",
  default: "standard",
  help: "hjälptext",
  example: "exempel",
  advanced: "teknisk",
};

function comparable(k: StoredKey | CatalogKey) {
  const isStored = "defaultValue" in k;
  return {
    label: k.label,
    group: k.group,
    type: k.type,
    // Postgres jsonb reorders object keys, so compare options as [value, label] pairs.
    options: JSON.stringify(
      Array.isArray(k.options) ? (k.options as { value: unknown; label: unknown }[]).map((o) => [o.value, o.label]) : null
    ),
    unit: k.unit ?? null,
    separator: k.separator ?? ",",
    default: (isStored ? (k as StoredKey).defaultValue : (k as CatalogKey).default) ?? null,
    help: k.help ?? null,
    example: k.example ?? null,
    advanced: !!k.advanced,
  };
}

export type CatalogDiff = {
  added: CatalogKey[];
  changed: { key: CatalogKey; fields: string[] }[];
  removed: { key: string; label: string }[];
};

export function diffCatalog(stored: StoredKey[], incoming: CatalogFile): CatalogDiff {
  const byKey = new Map(stored.map((k) => [k.key, k]));
  const incomingKeys = new Set(incoming.keys.map((k) => k.key));
  const diff: CatalogDiff = { added: [], changed: [], removed: [] };

  for (const k of incoming.keys) {
    const old = byKey.get(k.key);
    if (!old) {
      diff.added.push(k);
      continue;
    }
    const a = comparable(old), b = comparable(k);
    const fields = (Object.keys(a) as (keyof typeof a)[]).filter((f) => a[f] !== b[f]).map((f) => FIELD_LABELS[f]);
    if (fields.length) diff.changed.push({ key: k, fields });
  }
  for (const k of stored) if (!incomingKeys.has(k.key)) diff.removed.push({ key: k.key, label: k.label });
  return diff;
}

/** Replace the ConfigKey cache with the catalog. Values in layers are never touched. */
export async function applyCatalog(
  db: PrismaClient,
  catalog: CatalogFile,
  meta: { source: string; version: string; fetchedBy: string }
) {
  const keys = catalog.keys.map((k) => k.key);
  await db.$transaction([
    db.configKey.deleteMany({ where: { key: { notIn: keys } } }),
    ...catalog.keys.map((k, i) => {
      const data = {
        label: k.label,
        group: k.group,
        type: k.type,
        options: k.options ?? undefined,
        unit: k.unit ?? null,
        separator: k.separator ?? ",",
        defaultValue: k.default ?? null,
        help: k.help ?? null,
        example: k.example ?? null,
        advanced: !!k.advanced,
        sortOrder: i,
      };
      return db.configKey.upsert({ where: { key: k.key }, create: { key: k.key, ...data }, update: data });
    }),
    db.configCatalog.upsert({
      where: { id: 1 },
      create: { id: 1, ...meta, groups: catalog.groups, fetchedAt: new Date() },
      update: { ...meta, groups: catalog.groups, fetchedAt: new Date() },
    }),
  ]);
}

export type CatalogSource = { text: string; source: string; version: string };

/**
 * config/catalog.json from publicom on the branch the fleet runs (PUBLICOM_CATALOG_REF,
 * default stable), so the admin UI never offers a key the computers don't understand.
 * PUBLICOM_CATALOG_FILE reads a local checkout instead (dev).
 */
export async function fetchCatalogSource(env: NodeJS.ProcessEnv = process.env): Promise<CatalogSource> {
  const file = env.PUBLICOM_CATALOG_FILE;
  if (file) {
    const text = await readFile(file, "utf8");
    return { text, source: `file:${file}`, version: contentHash(text) };
  }

  const repo = env.PUBLICOM_CATALOG_REPO || "kth-biblioteket/publicom";
  const ref = env.PUBLICOM_CATALOG_REF || "stable";
  const path = "config/catalog.json";
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "publicomtools" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new Error(`Hittar inte ${path} på grenen ${ref} i ${repo}.`);
  if (!res.ok) throw new Error(`GitHub svarade ${res.status} för ${path}@${ref}.`);
  const body = (await res.json()) as { sha: string; content: string };
  return {
    text: Buffer.from(body.content, "base64").toString("utf8"),
    source: `${repo}@${ref}:${path}`,
    version: body.sha.slice(0, 12),
  };
}
