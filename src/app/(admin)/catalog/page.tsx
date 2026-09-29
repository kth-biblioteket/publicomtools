import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCatalogMeta } from "@/lib/catalog";
import { getCatalog } from "@/lib/settings";
import { formatValue } from "@/lib/settings-shared";
import { formatWhen } from "@/lib/status";
import { Chip } from "@/components/ui/chip";
import { CatalogUpdate } from "./catalog-update";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { bool: "Ja/nej", int: "Tal", string: "Text", csv: "Lista", url: "Adress", enum: "Val" } as const;

export default async function CatalogPage() {
  await requireAdmin();
  const [{ catalog, groups }, meta, layers, computers] = await Promise.all([
    getCatalog(),
    getCatalogMeta(),
    db.configLayer.findMany({ select: { kind: true, name: true, values: true } }),
    db.computer.findMany({ select: { overrides: true } }),
  ]);

  // Where each key is set: "Grund", "2 profiler", "1 dator"
  const setIn = (key: string) => {
    const base = layers.some((l) => l.kind === "base" && key in ((l.values ?? {}) as object));
    const profiles = layers.filter((l) => l.kind === "profile" && key in ((l.values ?? {}) as object)).length;
    const hosts = computers.filter((c) => key in ((c.overrides ?? {}) as object)).length;
    return [base && "grund", profiles && `${profiles} ${profiles === 1 ? "profil" : "profiler"}`, hosts && `${hosts} ${hosts === 1 ? "dator" : "datorer"}`]
      .filter(Boolean)
      .join(", ") || "–";
  };
  const keysInUse = [
    ...new Set([
      ...layers.flatMap((l) => Object.keys((l.values ?? {}) as object)),
      ...computers.flatMap((c) => Object.keys((c.overrides ?? {}) as object)),
    ]),
  ];
  const refLabel = process.env.PUBLICOM_CATALOG_FILE ? "lokal fil" : process.env.PUBLICOM_CATALOG_REF || "stable";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">Inställningskatalog</h1>
        <p className="mt-1 max-w-[680px] text-sm text-muted">
          Vilka inställningar datorerna förstår. Katalogen skrivs i publicom (<span className="font-mono">config/catalog.json</span>),
          bredvid koden som läser nycklarna, och hämtas från samma gren som flottan kör.
        </p>
      </div>
      <div className="flex flex-wrap gap-x-7 gap-y-1 text-[13.5px] text-muted">
        <span>Källa: <span className="font-mono text-[12.5px] text-ink">{meta?.source ?? "ingen hämtad än"}</span></span>
        {meta && <span>Version <span className="font-mono text-[12.5px] text-ink">{meta.version}</span>, hämtad {formatWhen(meta.fetchedAt)} av {meta.fetchedBy}</span>}
        <span>{catalog.length} inställningar</span>
      </div>
      <CatalogUpdate refLabel={refLabel} keysInUse={keysInUse} />

      {groups.map((g) => {
        const keys = catalog.filter((k) => k.group === g.id);
        if (!keys.length) return null;
        return (
          <section key={g.id}>
            <h2 className="mb-2 text-[15px] font-extrabold">{g.label}</h2>
            <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
              <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="w-[34%] border-b border-line px-4 py-2.5">Inställning</th>
                    <th className="border-b border-line px-4 py-2.5">Typ</th>
                    <th className="border-b border-line px-4 py-2.5">Standard</th>
                    <th className="border-b border-line px-4 py-2.5">Satt i</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.key} className="border-b border-line-soft align-top last:border-0">
                      <td className="px-4 py-2.5">
                        <b>{k.label}</b> {k.advanced && <Chip tone="it">IT</Chip>}
                        <div className="font-mono text-xs text-muted">{k.key}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {TYPE_LABEL[k.type]}
                        {k.unit ? `, ${k.unit}` : ""}
                        {k.type === "enum" && <div className="text-xs text-muted">{k.options.map((o) => o.label).join(" · ")}</div>}
                      </td>
                      <td className="px-4 py-2.5">{k.defaultValue !== null ? formatValue(k, k.defaultValue) : <span className="text-faint">–</span>}</td>
                      <td className="px-4 py-2.5 text-muted">{setIn(k.key)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
