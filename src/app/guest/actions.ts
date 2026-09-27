"use server";

import { login, type LoginOutcome } from "@/lib/guest-login";
import { getGuestTicket } from "@/lib/guest-cookie";

export type LoginState = LoginOutcome | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = String(formData.get("username") ?? "").trim();
  const code = String(formData.get("password") ?? "");
  if (!user || !code) return undefined;
  return login(await getGuestTicket(), user.slice(0, 200), code.slice(0, 200));
}
