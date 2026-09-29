"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { saveSettings, type SaveInput, type SaveResult } from "@/lib/settings";
import type { Target } from "@/lib/settings-shared";

/** Save from the settings form: only the keys that changed, plus an optional note. */
export async function saveSettingsAction(target: Target, input: SaveInput): Promise<SaveResult> {
  const user = await requireAdmin();
  if (!/^(base|profile:[\w.-]+|host:[a-z0-9][a-z0-9-]*)$/.test(target)) return { ok: false, error: "Ogiltigt mål." };
  const result = await saveSettings(target, input, user.email);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
