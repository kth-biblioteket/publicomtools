import { requireAdmin } from "@/lib/auth";
import { getHistory } from "@/lib/config";
import { restoreAction } from "../../actions";

export const dynamic = "force-dynamic";

type ValueMap = Record<string, string>;

/** Snapshots are either a plain values map (base/profile) or { profile, overrides } (host). */
function snapshotValues(snapshot: unknown): { profile?: string | null; values: ValueMap } {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  if ("overrides" in s || "profile" in s) {
    const ov = (s.overrides ?? {}) as Record<string, unknown>;
    const values: ValueMap = {};
    for (const [k, v] of Object.entries(ov)) values[k] = String(v);
    return { profile: s.profile == null ? null : String(s.profile), values };
  }
  const values: ValueMap = {};
  for (const [k, v] of Object.entries(s)) values[k] = String(v);
  return { values };
}

function diff(now: ValueMap, prev: ValueMap): string[] {
  const lines: string[] = [];
  for (const k of Object.keys(now)) {
    if (!(k in prev)) lines.push(`+ ${k}="${now[k]}"`);
    else if (prev[k] !== now[k]) lines.push(`~ ${k}: "${prev[k]}" → "${now[k]}"`);
  }
  for (const k of Object.keys(prev)) if (!(k in now)) lines.push(`- ${k} (var "${prev[k]}")`);
  return lines;
}

export default async function ConfigHistoryPage({ params }: { params: Promise<{ target: string }> }) {
  await requireAdmin();
  const { target } = await params;
  const changes = await getHistory(target);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-kth-navy">Historik: {target}</h1>
      <p className="mt-1 text-sm text-gray-600">Senaste 50 ändringarna, nyast först. Återställ skriver tillbaka en tidigare version som en ny ändring.</p>

      {changes.length === 0 ? (
        <p className="mt-6 text-gray-600">Inga ändringar än.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {changes.map((c, i) => {
            const cur = snapshotValues(c.snapshot);
            const prev = i + 1 < changes.length ? snapshotValues(changes[i + 1].snapshot) : { values: {} as ValueMap };
            const changed = diff(cur.values, prev.values);
            const profileChanged = "profile" in cur && cur.profile !== prev.profile;
            return (
              <li key={c.id} className="rounded-md border border-gray-200 p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-gray-700">
                    {new Date(c.changedAt).toLocaleString("sv-SE")} · {c.changedBy}
                    {i === 0 && <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-800">nuvarande</span>}
                  </span>
                  {i !== 0 && (
                    <form action={restoreAction.bind(null, target, c.id)}>
                      <button type="submit" className="text-kth-blue hover:underline">Återställ till denna</button>
                    </form>
                  )}
                </div>
                {(changed.length > 0 || profileChanged) ? (
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-gray-800">
                    {profileChanged ? `~ profil: ${prev.profile ?? "(ingen)"} → ${cur.profile ?? "(ingen)"}\n` : ""}
                    {changed.join("\n")}
                  </pre>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">Inga värdeändringar mot föregående.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
