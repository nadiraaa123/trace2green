import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ConfigNotice } from "@/components/ConfigNotice";

export const metadata: Metadata = {
  title: { default: "Trace2Green", template: "%s · Trace2Green" },
  description: "Platform pengumpulan, verifikasi, dan penilaian data lingkungan pemasok UMKM.",
};

export const viewport: Viewport = { themeColor: "#168B73", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full">
        <ConfigNotice />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
