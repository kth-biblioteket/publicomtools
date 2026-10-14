"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteMediaAction } from "@/app/(admin)/media/actions";

type Item = {
  id: string;
  name: string;
  kind: "image" | "video";
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
  uploadedBy: string;
  usedBy: string[];
  missing: boolean;
};

const BTN = "h-9 rounded-lg border-2 border-kth-blue bg-white px-3 text-[13px] font-bold text-kth-blue hover:bg-select disabled:opacity-40";
const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

/** The signs' media library: upload (several files, one at a time), usage, delete */
export function MediaLibrary({ media, quota, fileBase, uploadUrl }: { media: Item[]; quota: number; fileBase: string; uploadUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unused">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const used = media.reduce((n, m) => n + m.bytes, 0);
  const unused = media.filter((m) => !m.usedBy.length);
  const shown = filter === "unused" ? unused : media;

  const upload = async (files: FileList | null) => {
    setError(null);
    for (const file of Array.from(files ?? [])) {
      setBusy(file.name);
      try {
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
          body: file,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(`${file.name}: ${json.error ?? `uppladdningen misslyckades (${res.status})`}`);
          break;
        }
      } catch {
        setError(`${file.name}: uppladdningen avbröts. Kontrollera nätet och försök igen.`);
        break;
      }
    }
    setBusy(null);
    router.refresh();
  };
  const remove = async (m: Item) => {
    if (!confirm(`Ta bort ${m.name}?`)) return;
    const res = await deleteMediaAction(m.id);
    if (!res.ok) setError(res.error);
    else router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white px-5 py-4">
        <button type="button" className={BTN} disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy ? `Laddar upp ${busy}…` : "Ladda upp…"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
          className="sr-only"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="text-[13px] text-muted">Bild (JPEG, PNG, WebP) och pdf högst 30 MB, film (MP4) högst 200 MB. Bilder skalas om till 1920 punkter.</span>
        <span className="flex-1" />
        <span className="flex min-w-[220px] flex-col gap-1 text-[12.5px] text-muted">
          <span>
            <b className="text-ink">{size(used)}</b> av {size(quota)} använt
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-[#eceef1]">
            <span className="block h-full bg-kth-blue" style={{ width: `${Math.min(100, (used / quota) * 100)}%` }} />
          </span>
        </span>
      </section>
      {error && <p role="alert" className="text-[13px] font-semibold text-bad-ink">{error}</p>}
      <div className="flex items-center gap-2 text-[13.5px]">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={filter === "unused"} onChange={(e) => setFilter(e.target.checked ? "unused" : "all")} />
          Visa bara filer som inte används ({unused.length})
        </label>
      </div>
      {shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {shown.map((m) => (
            <figure key={m.id} className="m-0 flex flex-col overflow-hidden rounded-xl border border-line bg-white">
              {m.missing ? (
                <span className="flex aspect-video items-center justify-center bg-bad-bg text-[12px] font-semibold text-bad-ink">Saknas på disk</span>
              ) : m.kind === "video" ? (
                <video src={`${fileBase}${m.id}#t=0.5`} muted preload="metadata" className="aspect-video w-full bg-kth-navy object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- ur mediebiblioteket, redan nedskalad
                <img src={`${fileBase}${m.id}`} alt="" loading="lazy" className="aspect-video w-full bg-kth-navy object-cover" />
              )}
              <figcaption className="flex flex-col gap-1 p-3 text-[12.5px]">
                <span className="truncate text-[13.5px] font-bold" title={m.name}>{m.name}</span>
                <span className="text-muted">
                  {m.kind === "video" ? `Film${m.durationMs ? ` · ${Math.round(m.durationMs / 1000)} s` : ""}` : `Bild${m.width ? ` · ${m.width}×${m.height}` : ""}`} · {size(m.bytes)}
                </span>
                <span className={m.usedBy.length ? "text-ink" : "text-muted"}>{m.usedBy.length ? `Används av ${m.usedBy.join(", ")}` : "Används inte"}</span>
                <button type="button" disabled={m.usedBy.length > 0} onClick={() => remove(m)} className="self-start text-[12.5px] font-bold text-bad-ink disabled:opacity-40">
                  Ta bort
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{filter === "unused" ? "Alla filer används." : "Mediebiblioteket är tomt."}</p>
      )}
    </div>
  );
}
