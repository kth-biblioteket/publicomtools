import { checkDeviceAuth } from "@/lib/device-auth";
import { createTicket, ticketRequestSchema } from "@/lib/guest-login";

export const dynamic = "force-dynamic";

/** A guest computer starts a new login screen (login_session.sh in publicom, as root). */
export async function POST(request: Request) {
  const denied = checkDeviceAuth(request);
  if (denied) return denied;

  const parsed = ticketRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const ticket = await createTicket(parsed.data);
  return Response.json({ ticket, loginPath: `/guest/start?ticket=${encodeURIComponent(ticket)}` });
}
