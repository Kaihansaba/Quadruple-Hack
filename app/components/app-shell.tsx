"use client";

import { useEffect, useState } from "react";
import { HistorySidebar } from "./history-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cursor, setCursor] = useState({ x: -400, y: -400 });

  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-open", sidebarOpen);
    return () => document.documentElement.classList.remove("sidebar-open");
  }, [sidebarOpen]);

  useEffect(() => {
    function updateCursor(event: PointerEvent) {
      setCursor({ x: event.clientX, y: event.clientY });
    }

    window.addEventListener("pointermove", updateCursor);
    return () => window.removeEventListener("pointermove", updateCursor);
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[5] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/[0.08] blur-[90px] transition-transform duration-75"
        style={{ left: cursor.x, top: cursor.y }}
      />
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
