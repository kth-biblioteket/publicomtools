"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { deleteMedia } from "@/lib/media";
import { ensureSnap, isSnapId, renderSnap, setSnapRefresh, SNAP_REFRESH, SNAP_SIZES, toSnapInfo, type SnapInfo } from "@/lib/snap";

export async function deleteMediaAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { ok: false, error: "Logga in som administratör." };
  const res = await deleteMedia(id);
  if (res.ok) revalidatePath("/media");
  return res;
}

/**
 * Sida som bild: the row for an address and orientation (created if new) and its first image, so
 * admin can show it at once. The playlist row itself is saved with the settings as usual.
 */
export async function createSnapAction(input: {
  url: string;
  orientation: "landscape" | "portrait";
  refreshMin: number;
}): Promise<{ ok: true; snap: SnapInfo } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { ok: false, error: "Logga in som administratör." };
  const url = input.url.trim();
  if (!/^https:\/\/[^\s/]+/.test(url) || url.length > 1000) return { ok: false, error: "Adressen måste börja med https://." };
  if (!(SNAP_REFRESH as readonly number[]).includes(input.refreshMin)) return { ok: false, error: "Ogiltigt uppdateringsintervall." };
  const size = SNAP_SIZES[input.orientation];
  if (!size) return { ok: false, error: "Välj liggande eller stående." };
  const snap = await ensureSnap({ url, width: size[0], height: size[1], refreshMin: input.refreshMin, user: user.email });
  return { ok: true, snap: toSnapInfo((await renderSnap(snap.id)) ?? snap) };
}

/** Uppdatera nu: a new image of a Sida som bild right away */
export async function renderSnapAction(id: string): Promise<{ ok: true; snap: SnapInfo } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { ok: false, error: "Logga in som administratör." };
  if (!isSnapId(id)) return { ok: false, error: "Okänd bild." };
  const snap = await renderSnap(id);
  return snap ? { ok: true, snap: toSnapInfo(snap) } : { ok: false, error: "Bilden finns inte längre." };
}

/**
 * How often a Sida som bild gets a new image. Saved at once (it belongs to the image, not to a
 * playlist row, so every list that shows the same address and orientation follows it).
 */
export async function setSnapRefreshAction(id: string, refreshMin: number): Promise<{ ok: true; snap: SnapInfo } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { ok: false, error: "Logga in som administratör." };
  if (!isSnapId(id)) return { ok: false, error: "Okänd bild." };
  if (!(SNAP_REFRESH as readonly number[]).includes(refreshMin)) return { ok: false, error: "Ogiltigt uppdateringsintervall." };
  const snap = await setSnapRefresh(id, refreshMin);
  return snap ? { ok: true, snap: toSnapInfo(snap) } : { ok: false, error: "Bilden finns inte längre." };
}
