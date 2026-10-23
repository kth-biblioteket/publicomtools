import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { SignInFrame } from "@/components/ui/sign-in-frame";

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
    </SignInFrame>
  );
}
