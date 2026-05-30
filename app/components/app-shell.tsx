"use client";

import { useEffect, useState } from "react";
import { HistorySidebar } from "./history-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-open", sidebarOpen);
    return () => document.documentElement.classList.remove("sidebar-open");
  }, [sidebarOpen]);

  return (
    <>
      <HistorySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
      />
      <div
        className={
          sidebarOpen
            ? "transition-[padding] duration-300 lg:pl-72"
            : "transition-[padding] duration-300 lg:pl-0"
        }
      >
        {children}
      </div>
    </>
  );
}
