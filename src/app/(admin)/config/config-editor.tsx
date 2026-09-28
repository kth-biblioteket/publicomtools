"use client";

import { useActionState } from "react";
import type { SaveState } from "./actions";

type CatalogEntry = { key: string; type: string; enumValues: string | null; help: string | null };

type Props = {
  action: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  initialConfig: string;
  profiles?: string[];
  currentProfile?: string | null;
  catalog?: CatalogEntry[];
};

export function ConfigEditor({ action, initialConfig, profiles, currentProfile, catalog }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {profiles && (
        <label className="block">
          <span className="text-sm font-medium text-kth-navy">Profil</span>
          <select
            name="profile"
            defaultValue={currentProfile ?? ""}
            className="mt-1 block w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">(ingen)</option>
            {profiles.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-kth-navy">
          {profiles ? "Overrides" : "Värden"} (<code>KEY=&quot;value&quot;</code>, en per rad)
        </span>
        <textarea
          name="config"
          defaultValue={initialConfig}
          rows={18}
          spellCheck={false}
          className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-kth-blue px-4 py-2 text-sm font-medium text-white hover:bg-kth-navy disabled:opacity-50"
        >
          {pending ? "Sparar…" : "Spara"}
        </button>
        {state?.ok && <span className="text-sm text-green-700">Sparat.</span>}
        {state && !state.ok && state.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>

      {state && !state.ok && state.issues && state.issues.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Sparades inte — rätta detta:</p>
          <ul className="mt-1 list-disc pl-5">
            {state.issues.map((i, idx) => (
              <li key={idx}>
                <code>{i.key}</code>: {i.problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      {catalog && catalog.length > 0 && (
        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-kth-navy">Kända nycklar ({catalog.length})</summary>
          <table className="mt-2 divide-y divide-gray-200">
            <tbody className="divide-y divide-gray-100">
              {catalog.map((k) => (
                <tr key={k.key} className="align-top">
                  <td className="py-1 pr-3 font-mono text-xs">{k.key}</td>
                  <td className="py-1 pr-3 text-xs text-gray-500">
                    {k.type}
                    {k.enumValues ? ` (${k.enumValues})` : ""}
                  </td>
                  <td className="py-1 text-xs">{k.help}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </form>
  );
}
