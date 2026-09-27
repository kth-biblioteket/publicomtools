import type { Metadata } from "next";

export const metadata: Metadata = { title: "KTH Library guest computer" };

/** Full-screen kiosk layout for the guest computers' login screen (same look as the old Electron app). */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-1 flex-col items-center bg-kth-blue bg-cover bg-center bg-no-repeat font-light text-white select-none"
      style={{ backgroundImage: `url(${process.env.BASE_PATH ?? ""}/guest/background.png)` }}
    >
      {children}
    </div>
  );
}
