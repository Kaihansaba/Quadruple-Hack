import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "./components/app-shell";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Verdict",
  description: "Quantified B2B purchase decisions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
