import { requireAdmin } from "@/lib/auth";
import { planAndroidHomeMigration } from "@/lib/android-home";
import { PageHeader } from "@/components/ui/page-header";
import { MigrateButton } from "./migrate-button";

export const dynamic = "force-dynamic";

/** One-time move of START_URL into APPS on all Android levels (PubLiKiosk 3.20: the first service is home). */
export default async function AndroidHomePage() {
  await requireAdmin();
  const plan = await planAndroidHomeMigration();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/config/base/android", label: "Grundinställningar Android" }}
        title="Startsidan blir första tjänst"
        lead={
        <p>
          Från PubLiKiosk 3.20 är första tjänsten i listan hem, som på Linux-kiosken. Här flyttas den gamla startsidan (START_URL, med START_LABEL,
          START_ICON och APP_SCOPE) in som första tjänst på alla nivåer: grundinställningar, profiler och enskilda enheter. Enheterna visar samma
          tjänster efteråt; flytten görs först när alla Android-enheter har 3.20.
        </p>
        }
      />

      {plan.mismatches.length > 0 && (
        <p className="rounded-[10px] bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-ink">
          Flytten skulle ge andra tjänster för: {plan.mismatches.join(", ")}. Inget kan flyttas förrän det är rättat.
        </p>
      )}

      {plan.steps.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm text-muted">
          Inget att flytta: ingen nivå har START_URL eller APP_SCOPE kvar ({plan.checked} nivåer kontrollerade).
        </p>
      ) : (
        <>
          <p className="text-sm">
            {plan.steps.length} av {plan.checked} nivåer ändras:
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-white">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-page text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                <tr>
                  <th className="px-4 py-2.5">Nivå</th>
                  <th className="px-4 py-2.5">Ändring</th>
                  <th className="px-4 py-2.5">Tjänster (före = efter)</th>
                </tr>
              </thead>
              <tbody>
                {plan.steps.map((s) => (
                  <tr key={s.target} className="border-t border-line-soft align-top">
                    <td className="px-4 py-2.5 font-semibold">{s.label}</td>
                    <td className="px-4 py-2.5">
                      {s.set.APPS !== undefined && <div>Tjänster sätts med startsidan först</div>}
                      {s.unset.length > 0 && <div className="text-muted">Tas bort: {s.unset.join(", ")}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.servicesAfter.join(" · ") || "inga"}
                      {s.servicesAfter.join() !== s.servicesBefore.join() && (
                        <div className="font-semibold text-bad-ink">Före: {s.servicesBefore.join(" · ")}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MigrateButton disabled={plan.mismatches.length > 0} />
        </>
      )}
    </div>
  );
}
