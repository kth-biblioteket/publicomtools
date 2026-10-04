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

/** "Hämta nya inställningar nu": the computer's next heartbeat tells it to fetch its config. */
export async function requestReloadAction(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const updated = await db.computer.updateMany({
    where: { host },
    data: { reloadRequestedAt: new Date(), reloadRequestedBy: user.email },
  });
  if (!updated.count) return { ok: false, error: "Datorn finns inte längre." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Starta om datorn": the computer's next heartbeat tells it to reboot when nobody is using it. */
export async function requestRebootAction(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const updated = await db.computer.updateMany({
    where: { host },
    data: { rebootRequestedAt: new Date(), rebootRequestedBy: user.email },
  });
  if (!updated.count) return { ok: false, error: "Datorn finns inte längre." };
  revalidatePath("/", "layout");
  return { ok: true };
}
