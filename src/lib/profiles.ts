import "server-only";
import { db } from "@/lib/db";
import { displayName } from "@/lib/names";
import { asPlatform, type Platform } from "@/lib/platforms";

/**
 * Profiles: a named set of settings for one kind of computer. `name` is the id the
 * computers use (PUBLICOM_PROFILE) and never changes; `label` is what people see.
 */

export type ProfileSummary = {
  name: string;
  platform: Platform;
  label: string;
  description: string | null;
  keyCount: number;
  computers: { host: string; name: string; health?: string }[];
};

export async function getProfileLabels(): Promise<Map<string, string>> {
  const rows = await db.configLayer.findMany({ where: { kind: "profile" }, select: { name: true, label: true } });
  return new Map(rows.map((r) => [r.name, r.label || r.name]));
}

export async function listProfileSummaries(): Promise<ProfileSummary[]> {
  const [layers, computers] = await Promise.all([
    db.configLayer.findMany({ where: { kind: "profile" } }),
    db.computer.findMany({ select: { host: true, computerName: true, label: true, profile: true }, orderBy: { host: "asc" } }),
  ]);
  return layers
    .map((l) => ({
      name: l.name,
      platform: asPlatform(l.platform),
      label: l.label || l.name,
      description: l.description,
      keyCount: Object.keys((l.values ?? {}) as object).length,
      computers: computers.filter((c) => c.profile === l.name).map((c) => ({ host: c.host, name: displayName(c) })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "sv"));
}

/** "Utställningsskärm" → "utstallningsskarm" */
export function profileId(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createProfile(
  label: string,
  copyFrom: string | null,
  description: string | null,
  changedBy: string,
  platform: Platform = "linux"
) {
  const name = profileId(label);
  if (!name) return { ok: false as const, error: "Skriv ett namn med minst en bokstav eller siffra." };
  const existing = await db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name } } });
  if (existing) return { ok: false as const, error: `Det finns redan en profil med kortnamnet ${name}.` };

  let values: Record<string, string> = {};
  if (copyFrom) {
    const src = await db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name: copyFrom } } });
    if (!src) return { ok: false as const, error: "Profilen du vill kopiera finns inte." };
    if (asPlatform(src.platform) !== platform) return { ok: false as const, error: "Profilen du vill kopiera är för en annan sorts enhet." };
    values = (src.values ?? {}) as Record<string, string>;
  }
  const changes = Object.entries(values).map(([key, after]) => ({ key, before: null, after }));
  await db.$transaction([
    db.configLayer.create({ data: { kind: "profile", name, platform, label: label.trim(), description, values } }),
    db.configChange.create({
      data: {
        target: `profile:${name}`,
        snapshot: values,
        changedBy,
        note: copyFrom ? `Ny profil, kopia av ${copyFrom}` : "Ny profil",
        changes,
      },
    }),
  ]);
  return { ok: true as const, name };
}

export async function updateProfileMeta(name: string, label: string, description: string | null) {
  if (!label.trim()) return { ok: false as const, error: "Namnet får inte vara tomt." };
  await db.configLayer.update({
    where: { kind_name: { kind: "profile", name } },
    data: { label: label.trim(), description: description?.trim() || null },
  });
  return { ok: true as const };
}

export async function deleteProfile(name: string) {
  const used = await db.computer.count({ where: { profile: name } });
  if (used) return { ok: false as const, error: `Profilen används av ${used} ${used === 1 ? "dator" : "datorer"}. Byt profil på dem först.` };
  await db.configLayer.delete({ where: { kind_name: { kind: "profile", name } } });
  return { ok: true as const };
}
