"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createProfile, deleteProfile, updateProfileMeta } from "@/lib/profiles";

export type ProfileFormState = { error?: string } | undefined;

export async function createProfileAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const user = await requireAdmin();
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  const copyFrom = String(form.get("copyFrom") ?? "") || null;
  const description = String(form.get("description") ?? "").trim().slice(0, 200) || null;
  const res = await createProfile(label, copyFrom, description, user.email);
  if (!res.ok) return { error: res.error };
  revalidatePath("/", "layout");
  redirect(`/config/profiles/${res.name}`);
}

export async function updateProfileAction(name: string, _prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  await requireAdmin();
  const res = await updateProfileMeta(name, String(form.get("label") ?? "").slice(0, 80), String(form.get("description") ?? "").slice(0, 200));
  if (!res.ok) return { error: res.error };
  revalidatePath("/", "layout");
  return {};
}

export async function deleteProfileAction(name: string): Promise<ProfileFormState> {
  await requireAdmin();
  const res = await deleteProfile(name);
  if (!res.ok) return { error: res.error };
  revalidatePath("/", "layout");
  redirect("/config");
}
