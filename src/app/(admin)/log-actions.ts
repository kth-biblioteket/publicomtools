"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getChange, revertChange, revertConflicts } from "@/lib/changelog";

/** For the confirm dialog: which keys were changed again after this change. */
export async function revertPreviewAction(id: string): Promise<{ conflicts: string[] } | { error: string }> {
  await requireAdmin();
  const entry = await getChange(id);
  if (!entry) return { error: "Ändringen finns inte längre." };
  return { conflicts: (await revertConflicts(entry)).map((c) => c.key) };
}

export async function revertAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const res = await revertChange(id, user.email);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/", "layout");
  return { ok: true };
}
