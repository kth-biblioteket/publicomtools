import Link from "next/link";
import { findLogin } from "@/lib/guest-login";
import { getGuestTicket } from "@/lib/guest-cookie";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function GuestLoginPage() {
  const screen = await findLogin(await getGuestTicket());
  const open = screen && screen.status !== "superseded" && screen.status !== "ended" && screen.expiresAt > new Date();

  return (
    <>
      {open && screen.status !== "active" && process.env.REGISTER_ACCOUNT_URL && (
        <div className="absolute top-4 left-4">
          <Link
            href="/guest/register"
            className="inline-block rounded-md bg-white/10 px-4 py-2 text-lg font-medium hover:bg-white/20"
          >
            Registrera bibliotekskonto / Register library account
          </Link>
        </div>
      )}
      <h1 className="mt-24 text-center text-6xl font-semibold">Gästdator för dig som besöker KTH</h1>
      <p className="mt-6 text-center text-6xl font-semibold text-kth-sky">Guest computer for visitors to KTH</p>

      {!open ? (
        <p className="mt-16 text-2xl">Inloggningen startar om, vänta... / The login is restarting, please wait...</p>
      ) : screen.status === "active" ? (
        <p className="mt-16 text-3xl font-medium">Välkommen! Din session startar... / Welcome! Your session is starting...</p>
      ) : (
        <>
          <div className="mt-10 w-full max-w-4xl bg-[#4f9f5f] py-6 text-center font-semibold">
            <div className="text-8xl">{screen.computerName || screen.resourceId}</div>
            <div className="mt-4 text-5xl">Ledig / Available</div>
          </div>
          <LoginForm
            passwordLabel={screen.loginType === "pin" ? "PIN" : "lösenord / password"}
            clearAfterMs={Number(process.env.GUEST_CLEAR_FIELDS_MS ?? 30000)}
          />
        </>
      )}
    </>
  );
}
