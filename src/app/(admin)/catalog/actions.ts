"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { previewCatalogUpdate, updateCatalog, uploadedSource, type CatalogPreview } from "@/lib/catalog";

/** A catalog.json read in the browser: name + text. Omitted = fetch from GitHub. */
export type Upload = { name: string; text: string };

const MAX_BYTES = 512 * 1024;

function source(upload?: Upload) {
  if (!upload) return undefined;
  if (upload.text.length > MAX_BYTES) throw new Error("Filen är för stor för att vara en catalog.json.");
  return uploadedSource(upload.name, upload.text);
}

function message(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

export async function previewCatalogAction(upload?: Upload): Promise<{ ok: true; preview: CatalogPreview } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, preview: await previewCatalogUpdate(source(upload)) };
  } catch (e) {
    return { ok: false, error: message(e, "Kunde inte läsa katalogen.") };
  }
}

export async function updateCatalogAction(version: string, upload?: Upload): Promise<{ ok: true; keys: number } | { ok: false; error: string }> {
  const user = await requireAdmin();
  try {
    const res = await updateCatalog(user.email, version, source(upload));
    revalidatePath("/", "layout");
    return { ok: true, keys: res.keys };
  } catch (e) {
    return { ok: false, error: message(e, "Kunde inte uppdatera katalogen.") };
  }
}
