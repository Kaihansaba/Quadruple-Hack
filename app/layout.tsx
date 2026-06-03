import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "./components/app-shell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Verdict",
  description: "Quantified B2B purchase decisions"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        {/* Runs before hydration — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('verdict:theme');var sysLight=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;if(t==='light'||(t===null&&sysLight))document.documentElement.setAttribute('data-theme','light');})()` }} />
      </head>
      <body>
        <AppShell initialProfileName={null}>{children}</AppShell>
      </body>
    </html>
  );
}
