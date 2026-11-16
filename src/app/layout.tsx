import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WaktuSolat — Paparan Waktu Solat Masjid & Surau", template: "%s · WaktuSolat" },
  description: "Platform paparan digital waktu solat rasmi JAKIM untuk masjid dan surau di Malaysia.",
  applicationName: "WaktuSolat",
  appleWebApp: { capable: true, title: "WaktuSolat", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#064e3b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
