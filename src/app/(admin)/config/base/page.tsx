import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLayerValues, listCatalog, serializeEnv } from "@/lib/config";
import { saveLayerAction } from "../actions";
import { ConfigEditor } from "../config-editor";

export const dynamic = "force-dynamic";

export default async function EditBasePage() {
  await requireAdmin();
  const [values, catalog] = await Promise.all([getLayerValues("base", ""), listCatalog()]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-kth-navy">base</h1>
        <Link href="/config/history/base" className="text-sm text-kth-blue hover:underline">
          Historik
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-600">Gemensamma standardvärden för alla datorer.</p>
      <ConfigEditor
        action={saveLayerAction.bind(null, "base", "")}
        initialConfig={serializeEnv(values)}
        catalog={catalog}
      />
    </div>
  );
}
