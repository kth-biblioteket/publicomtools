"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { applyAndroidHomeMigration } from "@/lib/android-home";

export type MigrationState = { ok: boolean; message: string } | undefined;

export async function migrateAndroidHomeAction(_prev: MigrationState): Promise<MigrationState> {
  const user = await requireAdmin();
  const res = await applyAndroidHomeMigration(user.email);
  revalidatePath("/", "layout");
  return res.ok
    ? { ok: true, message: res.saved ? `Klart: ${res.saved} ${res.saved === 1 ? "nivå" : "nivåer"} sparade. Ändringarna finns i historiken.` : "Inget att flytta." }
    : { ok: false, message: res.saved ? `${res.error} (${res.saved} nivåer hann sparas.)` : res.error };
}
