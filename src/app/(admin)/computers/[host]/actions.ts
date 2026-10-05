"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { newEnrollCode } from "@/lib/enroll";

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

/**
 * Android: a new one-time enrollment code (valid a day), shown once. Revokes the device's current
 * token, so the tablet has to be enrolled again with the code.
 */
export async function newEnrollCodeAction(host: string): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string }> {
  await requireAdmin();
  const c = await db.computer.findUnique({ where: { host }, select: { platform: true } });
  if (!c) return { ok: false, error: "Enheten finns inte längre." };
  if (c.platform !== "android") return { ok: false, error: "Bara Android-enheter skrivs in med kod." };
  const { code, expiresAt } = await newEnrollCode(host);
  revalidatePath("/", "layout");
  return { ok: true, code, expiresAt: expiresAt.toISOString() };
}

/** Android: "Ta skärmdump". The tablet sends one with its next heartbeat. */
export async function requestScreenshotAction(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const updated = await db.computer.updateMany({
    where: { host, platform: "android" },
    data: { screenshotRequestedAt: new Date(), screenshotRequestedBy: user.email },
  });
  if (!updated.count) return { ok: false, error: "Enheten finns inte längre." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Android: "Lås upp menyn" after too many wrong PINs. Sent once with the next heartbeat. */
export async function requestPinUnlockAction(host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const updated = await db.computer.updateMany({
    where: { host, platform: "android" },
    data: { pinUnlockRequestedAt: new Date(), pinUnlockRequestedBy: user.email },
  });
  if (!updated.count) return { ok: false, error: "Enheten finns inte längre." };
  revalidatePath("/", "layout");
  return { ok: true };
}
