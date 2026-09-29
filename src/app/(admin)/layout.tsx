import type { Metadata } from "next";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { logout } from "@/app/actions";
import { AdminShell } from "@/components/admin-shell";

export const metadata: Metadata = {
  title: "Publika datorer – KTH Biblioteket",
  description: "Status och inställningar för bibliotekets publika datorer",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Login and "ingen behörighet" render without the menu.
  if (!user || !isAdmin(user)) {
    return <div className="flex min-h-full flex-1 flex-col bg-page px-4 text-ink">{children}</div>;
  }
  return (
    <AdminShell userName={user.name} logout={logout}>
      {children}
    </AdminShell>
  );
}
