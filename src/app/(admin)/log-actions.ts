"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { settingsDenied } from "@/lib/roles";
import { getChange, revertChange, revertConflicts } from "@/lib/changelog";

/** For the confirm dialog: which keys were changed again after this change. */
export async function revertPreviewAction(id: string): Promise<{ conflicts: string[] } | { error: string }> {
  await requireRole("innehall");
  const entry = await getChange(id);
  if (!entry) return { error: "Ändringen finns inte längre." };
  return { conflicts: (await revertConflicts(entry)).map((c) => c.key) };
}

export async function revertAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireRole("innehall");
  const entry = await getChange(id);
  if (!entry) return { ok: false, error: "Ändringen finns inte längre." };
  const denied = settingsDenied(user.role, entry.target, entry.changes.map((c) => c.key));
  if (denied) return { ok: false, error: denied };
  const res = await revertChange(id, user.email);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/", "layout");
  return { ok: true };
}
