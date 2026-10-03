import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

/** Gamla adressen: inställningarna är nu en flik på datorsidan. */
export default async function OldComputerConfigPage({ params }: PageProps<"/computers/[host]/config">) {
  // Every page checks itself: the [host] layout is not re-rendered on client-side navigation.
  await requireAdmin();
  const { host } = await params;
  redirect(`/computers/${host}/settings`);
}
