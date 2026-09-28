"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  parseConfigText,
  validateLayer,
  saveLayer,
  saveComputerConfig,
  restoreSnapshot,
  type ValidationIssue,
} from "@/lib/config";

export type SaveState =
  | { ok: true }
  | { ok: false; issues?: ValidationIssue[]; error?: string }
  | undefined;

/** Save the base layer or a profile. kind/name are bound; prev/formData come from useActionState. */
export async function saveLayerAction(
  kind: "base" | "profile",
  name: string,
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const user = await requireAdmin();
  const values = parseConfigText(String(formData.get("config") ?? ""));
  const issues = await validateLayer(values);
  if (issues.length) return { ok: false, issues };
  await saveLayer(kind, name, values, user.email);
  revalidatePath("/config");
  return { ok: true };
}

/** Save a computer's profile + overrides. host is bound. */
export async function saveComputerConfigAction(
  host: string,
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const user = await requireAdmin();
  const profileRaw = String(formData.get("profile") ?? "").trim();
  const profile = profileRaw || null;
  const overrides = parseConfigText(String(formData.get("config") ?? ""));
  const issues = await validateLayer(overrides);
  if (issues.length) return { ok: false, issues };
  await saveComputerConfig(host, profile, overrides, user.email);
  revalidatePath(`/computers/${host}`);
  revalidatePath(`/computers/${host}/config`);
  return { ok: true };
}

/** Restore a previous snapshot. target/changeId bound; used as a plain <form action>. */
export async function restoreAction(target: string, changeId: string) {
  const user = await requireAdmin();
  await restoreSnapshot(changeId, user.email);
  revalidatePath(`/config/history/${encodeURIComponent(target)}`);
  revalidatePath("/config");
}
