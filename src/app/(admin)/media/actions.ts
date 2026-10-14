"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { deleteMedia } from "@/lib/media";

export async function deleteMediaAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { ok: false, error: "Logga in som administratör." };
  const res = await deleteMedia(id);
  if (res.ok) revalidatePath("/media");
  return res;
}
