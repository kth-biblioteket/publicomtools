import { getCurrentUser, isAdmin } from "@/lib/auth";
import { saveUpload } from "@/lib/media";

export const dynamic = "force-dynamic";

/**
 * Upload to the signs' media library: one file per request (a pdf becomes one image per page), the
 * raw body with its name in X-File-Name (URL-encoded). A route handler, not a server action, since
 * those stop at 1 MB. Only admins, and only from the admin's own pages (Origin check), so another
 * site can't upload in their name.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return Response.json({ error: "Logga in som administratör." }, { status: 403 });
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return Response.json({ error: "Fel ursprung." }, { status: 403 });
  if (!request.body) return Response.json({ error: "Ingen fil." }, { status: 400 });
  let name = "Utan namn";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? name);
  } catch {}
  const res = await saveUpload(request.body, name, user.email);
  return res.ok ? Response.json(res) : Response.json({ error: res.error }, { status: 400 });
}
