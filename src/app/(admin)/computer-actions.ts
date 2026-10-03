"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PROFILE_KEY } from "@/lib/settings-shared";

export type AddComputerState = { error?: string } | undefined;

/** Same rule as the host in a heartbeat (lib/heartbeat.ts), which is the computer's id. */
const HOST = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Add a computer before it is installed, so it gets its settings on first boot.
 * It shows as "Väntar på installation" until it fetches its config.
 */
export async function addComputerAction(_prev: AddComputerState, form: FormData): Promise<AddComputerState> {
  const user = await requireAdmin();
  const host = String(form.get("host") ?? "").trim().toLowerCase();
  const profile = String(form.get("profile") ?? "") || null;
  const label = String(form.get("label") ?? "").trim().slice(0, 80) || null;

  if (!HOST.test(host)) return { error: "Värdnamnet får bara innehålla små bokstäver a–z, siffror och bindestreck, och börja med en bokstav eller siffra." };
  if (await db.computer.findUnique({ where: { host }, select: { host: true } }))
    return { error: `Det finns redan en dator som heter ${host}.` };
  if (profile && !(await db.configLayer.findUnique({ where: { kind_name: { kind: "profile", name: profile } }, select: { id: true } })))
    return { error: "Profilen finns inte längre. Ladda om sidan." };

  try {
    await db.$transaction([
      db.computer.create({
        data: { host, hostname: host, lastSeenAt: new Date(0), status: {}, profile, label, addedBy: user.email, configUpdatedAt: new Date(), configUpdatedBy: user.email },
      }),
      db.configChange.create({
        data: {
          target: `host:${host}`,
          snapshot: { profile, overrides: {} },
          changedBy: user.email,
          note: "Ny dator",
          changes: [{ key: PROFILE_KEY, before: null, after: profile }],
        },
      }),
    ]);
  } catch (e) {
    // The computer appeared in between, e.g. with its first heartbeat
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: `Det finns redan en dator som heter ${host}.` };
    throw e;
  }
  revalidatePath("/", "layout");
  redirect(`/computers/${host}/settings`);
}
