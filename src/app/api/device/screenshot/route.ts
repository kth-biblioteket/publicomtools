import { db } from "@/lib/db";
import { authenticateDevice } from "@/lib/device-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000;

/**
 * An Android tablet sends a screenshot of its own app (after "Ta skärmdump" in the admin) as a
 * JPEG body. Only with the device's own token, for itself; the latest one replaces the previous.
 */
export async function POST(request: Request) {
  const auth = await authenticateDevice(request);
  if ("denied" in auth) return auth.denied;
  if (auth.identity.kind !== "device") return Response.json({ error: "forbidden" }, { status: 403 });
  const host = auth.identity.host;

  if (!(request.headers.get("content-type") ?? "").startsWith("image/jpeg"))
    return Response.json({ error: "image/jpeg required" }, { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });

  const image = Buffer.from(await request.arrayBuffer());
  if (image.length > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  // JPEG starts with FF D8 FF
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff)
    return Response.json({ error: "not a jpeg" }, { status: 400 });

  const takenAt = new Date();
  await db.deviceScreenshot.upsert({ where: { host }, create: { host, image, takenAt }, update: { image, takenAt } });
  return Response.json({ ok: true });
}
