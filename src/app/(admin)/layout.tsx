import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions";

export const metadata: Metadata = {
  title: "PubLiCom status",
  description: "Status för bibliotekets publika datorer",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-gray-900">
      <header className="bg-kth-blue text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-semibold">
              PubLiCom status
            </Link>
            {user && (
              <Link href="/config" className="text-sm text-kth-light-blue hover:text-white">
                Konfiguration
              </Link>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden sm:inline">{user.name}</span>
              <form action={logout}>
                <button type="submit" className="text-kth-light-blue hover:text-white">
                  Logga ut
                </button>
              </form>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">{children}</main>
    </div>
  );
}
