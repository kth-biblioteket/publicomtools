import { redirect } from "next/navigation";
import { findLogin } from "@/lib/guest-login";
import { getGuestTicket } from "@/lib/guest-cookie";
import { RegisterFrame } from "./register-frame";

export const dynamic = "force-dynamic";

/** "Registrera bibliotekskonto": the library's account form inside the login screen. */
export default async function RegisterPage() {
  const url = process.env.REGISTER_ACCOUNT_URL;
  const screen = await findLogin(await getGuestTicket());
  if (!url || !screen || screen.status !== "pending") redirect("/guest");

  return <RegisterFrame url={url} idleMs={Number(process.env.GUEST_EXTERNAL_TIMEOUT_MS ?? 30000)} />;
}
