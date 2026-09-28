import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLayerValues, listCatalog, listProfiles, serializeEnv } from "@/lib/config";
import { saveLayerAction } from "../../actions";
import { ConfigEditor } from "../../config-editor";

export const dynamic = "force-dynamic";

export default async function EditProfilePage({ params }: { params: Promise<{ name: string }> }) {
  await requireAdmin();
  const { name } = await params;
  const profiles = await listProfiles();
  if (!profiles.includes(name)) {
    return <p className="text-gray-600">Profilen <code>{name}</code> finns inte.</p>;
  }
  const [values, catalog] = await Promise.all([getLayerValues("profile", name), listCatalog()]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-kth-navy">profil: {name}</h1>
        <Link href={`/config/history/profile:${name}`} className="text-sm text-kth-blue hover:underline">
          Historik
        </Link>
      </div>
      <p className="mt-1 text-sm text-gray-600">Värden som gäller datorer med denna profil (ovanpå base).</p>
      <ConfigEditor
        action={saveLayerAction.bind(null, "profile", name)}
        initialConfig={serializeEnv(values)}
        catalog={catalog}
      />
    </div>
  );
}
