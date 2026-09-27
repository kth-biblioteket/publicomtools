import { z } from "zod";
import { checkDeviceAuth } from "@/lib/device-auth";
import { endSession } from "@/lib/guest-login";

export const dynamic = "force-dynamic";

const schema = z.object({ host: z.string().min(1).max(63), bookingId: z.string().min(1).max(64) });

/** The session on a computer has ended (session_cleanup.sh, as root): end its booking. */
export async function POST(request: Request) {
  const denied = checkDeviceAuth(request);
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
  const found = await endSession(parsed.data.host, parsed.data.bookingId);
  return Response.json({ ok: found }, { status: found ? 200 : 404 });
}
