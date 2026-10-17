import { snapImage } from "@/lib/snap";

export const dynamic = "force-dynamic";

/**
 * The image behind /api/sign/s/<id>. The page asks for it with ?v=<when it was rendered>, so each
 * new image is a new address and the old one may be cached; without v, never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jpeg = await snapImage(id);
  const headers = { "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" };
  if (!jpeg) return new Response("Ingen bild än.", { status: 404, headers });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(new Uint8Array(jpeg), {
    headers: { ...headers, "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "Cache-Control": versioned ? "public, max-age=86400" : "no-store" },
  });
}
