import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { SignInFrame } from "@/components/ui/sign-in-frame";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  if (await getCurrentUser()) redirect("/");

  // KTH login is handled by librarytools-auth at the sibling path /mrbs, not
  // under this app's basePath — so the href has no basePath, but the paths
  // it sends the browser back to must be full paths including it.
  const kthLoginHref = `/mrbs/login?returnTo=${encodeURIComponent(withBasePath("/"))}&errorTo=${encodeURIComponent(
    withBasePath("/login")
  )}`;
  const oidcEnabled = Boolean(process.env.KTH_AUTH_JWKS_URL);

  return (
    <SignInFrame>
      <h1 className="text-3xl font-extrabold">Logga in</h1>
      <p className="mt-2 text-[15px] text-muted">PubLiAdmin, statussidan för bibliotekets publika enheter, är bara för personal.</p>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad-ink">
          {error === "oidc_state"
            ? "Inloggningen tog för lång tid. Försök igen."
            : "Inloggningen misslyckades. Försök igen."}
        </p>
      )}
      {oidcEnabled ? (
        <a
          href={kthLoginHref}
          className="mt-7 flex h-12 items-center justify-center rounded-lg bg-kth-blue px-5 text-[15px] font-bold text-white hover:bg-kth-navy"
        >
          Logga in med KTH-konto
        </a>
      ) : (
        <p className="mt-6 text-sm text-muted">KTH-inloggning är inte konfigurerad (KTH_AUTH_JWKS_URL).</p>
      )}
    </SignInFrame>
  );
}
