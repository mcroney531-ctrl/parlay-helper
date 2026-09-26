import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, League_Gothic } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
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

const leagueGothic = League_Gothic({
  variable: "--font-league-gothic",
  subsets: ["latin"],
  weight: "400",
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
  themeColor: "#18332b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${leagueGothic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: "var(--color-canvas)" }}>
        <ServiceWorkerRegistration />
        <DataProvider>
          <NavBar />
          <main className="mx-auto w-full flex-1 pb-nav-safe" style={{ maxWidth: "var(--content-max-width)" }}>
            {children}
          </main>
        </DataProvider>
      </body>
    </html>
  );
}
