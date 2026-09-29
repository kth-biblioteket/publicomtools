"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { restoreSnapshot } from "@/lib/config";

/** Restore a previous snapshot. target/changeId bound; used as a plain <form action>. */
export async function restoreAction(target: string, changeId: string) {
  const user = await requireAdmin();
  await restoreSnapshot(changeId, user.email);
  revalidatePath("/", "layout");
}
