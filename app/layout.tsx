import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "College Organizer",
  description: "A calm, unified calendar for coursework, organizations, and campus life.",
  manifest: "/manifest.json",
  applicationName: "College Organizer",
  appleWebApp: {
    capable: true,
    title: "College Organizer",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#059669" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50">
        <Sidebar />
        <div className="min-h-screen pb-20 md:pb-0 md:pl-64">{children}</div>
      </body>
    </html>
  );
}
