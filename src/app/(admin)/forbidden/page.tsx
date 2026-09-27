import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export default async function ForbiddenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user)) redirect("/");

  return (
    <div className="mx-auto max-w-lg py-16">
      <h1 className="text-2xl font-semibold text-kth-navy">Ingen behörighet</h1>
      <p className="mt-2 text-gray-600">
        Du är inloggad som {user.email}, men kontot har inte behörighet till statussidan. Kontakta den som
        förvaltar PubLiCom.
      </p>
    </div>
  );
}
