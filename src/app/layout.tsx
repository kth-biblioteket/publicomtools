import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// Figtree is KTH's official brand typeface (see KTH's graphic manual).
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PubLiCom",
  description: "KTH Bibliotekets publika datorer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
