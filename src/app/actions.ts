"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { destroySession, requireAdmin } from "@/lib/auth";

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Removes a decommissioned computer and its history. It comes back on its
 * next heartbeat if it is in fact still running. */
export async function deleteComputer(formData: FormData) {
  await requireAdmin();
  const host = z.string().min(1).parse(formData.get("host"));
  await db.computer.deleteMany({ where: { host } });
  redirect("/");
}
