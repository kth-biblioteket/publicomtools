import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";

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
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
      <h1 className="text-2xl font-semibold text-kth-navy">Logga in</h1>
      <p className="mt-1 text-sm text-gray-600">Statussidan för bibliotekets publika datorer är bara för personal.</p>
      {error && (
        <p className="mt-4 text-sm text-red-600">
          {error === "oidc_state"
            ? "Inloggningen tog för lång tid. Försök igen."
            : "Inloggningen misslyckades. Försök igen."}
        </p>
      )}
      {oidcEnabled ? (
        <a
          href={kthLoginHref}
          className="mt-6 rounded-md bg-kth-blue px-4 py-2 text-center font-medium text-white hover:bg-kth-navy"
        >
          Logga in med KTH-konto
        </a>
      ) : (
        <p className="mt-6 text-sm text-gray-600">KTH-inloggning är inte konfigurerad (KTH_AUTH_JWKS_URL).</p>
      )}
    </div>
  );
}
