import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { OnlineStatusBanner } from "@/components/OnlineStatusBanner";
import { DataProvider } from "./DataProvider";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parlay Helper",
  description: "A calm, personal planning tool for capturing prop ideas and assembling parlays deliberately.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3f5a7d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <DataProvider>
          <OnlineStatusBanner />
          <NavBar />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-4 sm:pb-8">{children}</main>
        </DataProvider>
      </body>
    </html>
  );
}
