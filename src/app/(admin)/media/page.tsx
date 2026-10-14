import { requireAdmin } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { listMedia, mediaOnDisk, QUOTA_BYTES } from "@/lib/media";
import { MediaLibrary } from "@/components/media/media-library";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  await requireAdmin();
  const media = await listMedia();
  const onDisk = await Promise.all(media.map((m) => mediaOnDisk(m.id)));
  return (
    <div className="flex max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Mediebibliotek</h1>
        <p className="mt-1 max-w-[720px] text-sm text-muted">
          Bilder, filmer och pdf:er som skyltarna kan visa. Lägg in dem i en spellista under Skylt i en profils inställningar. En pdf blir en bild per sida.
        </p>
      </div>
      <MediaLibrary
        media={media.map((m, i) => ({ ...m, createdAt: m.createdAt.toISOString(), missing: !onDisk[i] }))}
        quota={QUOTA_BYTES}
        fileBase={withBasePath("/api/sign/f/")}
        uploadUrl={withBasePath("/media/upload")}
      />
    </div>
  );
}
