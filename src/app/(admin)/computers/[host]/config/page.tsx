import { redirect } from "next/navigation";

/** Gamla adressen: inställningarna är nu en flik på datorsidan. */
export default async function OldComputerConfigPage({ params }: PageProps<"/computers/[host]/config">) {
  const { host } = await params;
  redirect(`/computers/${host}/settings`);
}
