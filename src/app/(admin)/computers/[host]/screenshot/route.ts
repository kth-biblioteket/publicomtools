import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The latest screenshot of an Android tablet, for the admin only. */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return new Response("forbidden", { status: 403 });
  const { host } = await params;
  const shot = await db.deviceScreenshot.findUnique({ where: { host } });
  if (!shot) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(shot.image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
