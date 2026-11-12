import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { SignInFrame } from "@/components/ui/sign-in-frame";
import { logout } from "@/app/actions";

export default async function ForbiddenPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAdmin(user)) redirect("/");

  return (
    <SignInFrame>
      <h1 className="text-3xl font-extrabold">Ingen behörighet</h1>
      <p className="mt-2 text-[15px] text-muted">
        Du är inloggad som {user.email}, men kontot har inte behörighet till statussidan. Kontakta den som
        förvaltar PubLiAdmin.
      </p>
      {/* Behörigheten (grupperna) läses vid inloggningen: logga ut och in igen efter en ändring */}
      <form action={logout} className="mt-5">
        <button type="submit" className="h-10 rounded-lg border border-kth-blue px-4 text-sm font-bold text-kth-blue hover:bg-select">
          Logga ut
        </button>
      </form>
    </SignInFrame>
  );
}
