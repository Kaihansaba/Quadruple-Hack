import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdict",
  description: "Quantified B2B purchase decisions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
