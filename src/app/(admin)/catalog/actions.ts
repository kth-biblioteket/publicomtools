"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { previewCatalogUpdate, updateCatalog, type CatalogPreview } from "@/lib/catalog";

export async function previewCatalogAction(): Promise<{ ok: true; preview: CatalogPreview } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, preview: await previewCatalogUpdate() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kunde inte hämta katalogen." };
  }
}

export async function updateCatalogAction(version: string): Promise<{ ok: true; keys: number } | { ok: false; error: string }> {
  const user = await requireAdmin();
  try {
    const res = await updateCatalog(user.email, version);
    revalidatePath("/", "layout");
    return { ok: true, keys: res.keys };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Kunde inte uppdatera katalogen." };
  }
}
