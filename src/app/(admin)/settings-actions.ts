"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { saveSettings, type SaveInput, type SaveResult } from "@/lib/settings";
import type { Target } from "@/lib/settings-shared";

const KEY = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(100);
const VALUE = z.string().max(10_000);

/** Server actions are public endpoints: check the shape of what the form sends. */
const saveInputSchema = z.object({
  set: z.record(KEY, VALUE),
  unset: z.array(KEY).max(500),
  before: z.record(z.string().max(100), VALUE.nullable()),
  profile: z.string().max(64).nullable().optional(),
  note: z.string().max(2000).optional(),
});

/** Save from the settings form: only the keys that changed, plus an optional note. */
export async function saveSettingsAction(target: Target, input: SaveInput): Promise<SaveResult> {
  const user = await requireAdmin();
  if (typeof target !== "string" || !/^(base|base:[a-z]+|profile:[\w.-]+|host:[a-z0-9][a-z0-9-]*)$/.test(target))
    return { ok: false, error: "Ogiltigt mål." };
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ändringarna kunde inte läsas. Ladda om sidan och försök igen." };
  const result = await saveSettings(target, parsed.data, user.email);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
