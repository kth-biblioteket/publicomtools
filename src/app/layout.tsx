import type { Metadata } from "next";
import Link from "next/link";
import { Figtree } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions";

// Figtree is KTH's official brand typeface (see KTH's graphic manual).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PubLiCom status",
  description: "Status för bibliotekets publika datorer",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html lang="sv" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <header className="bg-kth-blue text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              PubLiCom status
            </Link>
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
      </body>
    </html>
  );
}
