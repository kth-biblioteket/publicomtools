import { checkDeviceAuth } from "@/lib/device-auth";
import { findLogin, sessionView } from "@/lib/guest-login";

export const dynamic = "force-dynamic";

/** The computer (login_agent.sh, as root) waits here for someone to log in. */
export async function GET(request: Request) {
  const denied = checkDeviceAuth(request);
  if (denied) return denied;

  const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
  const screen = await findLogin(ticket);
  if (!screen) return Response.json({ status: "unknown" }, { status: 404 });
  return Response.json(sessionView(screen));
}
