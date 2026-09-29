"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** The name in the admin list. Admin only; never sent to the computer. Empty = use the computer's own name. */
export async function renameComputerAction(host: string, label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const value = label.trim().slice(0, 80) || null;
  const updated = await db.computer.updateMany({ where: { host }, data: { label: value } });
  if (!updated.count) return { ok: false, error: "Datorn finns inte längre." };
  revalidatePath("/", "layout");
  return { ok: true };
}
