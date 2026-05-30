import type { Metadata } from "next";
import { HistorySidebar } from "./components/history-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verdict",
  description: "Quantified B2B purchase decisions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HistorySidebar />
        <div className="lg:pl-72">{children}</div>
      </body>
    </html>
  );
}
